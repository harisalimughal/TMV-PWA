import { describe, it, expect } from "vitest";
import { parseCalendarEvent } from "../src/jobs/booking.service";

/** Minimal Calendar event whose title carries the "/Y-HE" confirmation tag so
 *  parseCalendarEvent() actually returns a booking. */
function ev(description: string, summary = "2 Men £120 /Y-HE") {
  return {
    id: "evt_1",
    status: "confirmed",
    summary,
    description,
    start: { dateTime: "2026-10-03T09:00:00+01:00" },
    end: { dateTime: "2026-10-03T13:00:00+01:00" }
  } as any;
}

describe("parseCalendarEvent field extraction", () => {
  it("reads phone from any of Phone Number / Phone / Call / Mob, even when stacked", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "Name: Helena Gray",
          "Email Address:",
          "Email:",
          "\thelena.rose96@gmail.com",
          "Phone Number:",
          "Phone:",
          "Call: ",
          "Mob: ",
          "",
          "7919183787",
          "Move Date: 03/10/2026"
        ].join("\n")
      )
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.customerName).toBe("Helena Gray");
    expect(parsed!.customerEmail).toBe("helena.rose96@gmail.com");
    expect(parsed!.customerPhone).toBe("7919183787");
  });

  it("reads an inline 'Call:' / 'Mob:' value", () => {
    expect(parseCalendarEvent(ev("Name: A B\nCall: 07123 456789"))!.customerPhone).toBe("07123 456789");
    expect(parseCalendarEvent(ev("Name: A B\nMob: +44 7919 183787"))!.customerPhone).toBe("+44 7919 183787");
  });

  it("reads pickup/drop-off from MOVE FROM / MOVE TO with the address on the next line", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "MOVE FROM:",
          "119 Queens Road, LONDON, Greater London, England, SE15 2EZ",
          "",
          "MOVE TO:",
          "1a Park Road, BURGESS HILL, West Sussex, England, RH15 8EU"
        ].join("\n")
      )
    );
    expect(parsed!.pickup).toBe("119 Queens Road, LONDON, Greater London, England, SE15 2EZ");
    expect(parsed!.dropoff).toBe("1a Park Road, BURGESS HILL, West Sussex, England, RH15 8EU");
  });

  it("reads pickup/drop-off from 'Pick address:' / 'Drop off:' inline", () => {
    const parsed = parseCalendarEvent(
      ev(["Pick address: 18, addington road e16 4ng", "Drop off: 1a Park Road, RH15 8EU"].join("\n"))
    );
    expect(parsed!.pickup).toBe("18, addington road e16 4ng");
    expect(parsed!.dropoff).toBe("1a Park Road, RH15 8EU");
  });

  it("splits a combined 'Floor From and To' line", () => {
    const parsed = parseCalendarEvent(
      ev("Floor From and To:\tFrom: 02 flight of stairs / To: 01 flight of stairs")
    );
    expect(parsed!.floorFrom).toBe("02 flight of stairs");
    expect(parsed!.floorTo).toBe("01 flight of stairs");
  });

  it("still reads separate 'Floor from:' / 'Floor to:' lines", () => {
    const parsed = parseCalendarEvent(ev("Floor from: Ground\nFloor to: 3rd floor"));
    expect(parsed!.floorFrom).toBe("Ground");
    expect(parsed!.floorTo).toBe("3rd floor");
  });

  it("does not treat a numbered address line as a label", () => {
    const parsed = parseCalendarEvent(
      ev(["Pickup:", "119 Queens Road, LONDON: SE15 2EZ", "Dropoff: 1a Park Road"].join("\n"))
    );
    expect(parsed!.pickup).toBe("119 Queens Road, LONDON: SE15 2EZ");
  });
});
