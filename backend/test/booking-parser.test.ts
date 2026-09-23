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

  it("falls back to the first standalone UK mobile number when no phone label is present", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "Collection:",
          "2 Mercers Place",
          "London",
          "W6 7BZ",
          "",
          "Delivery:",
          "Store First, Stanney Mill Road, Ellesmere Port, CH2 4HX",
          "",
          "Name: Tom Hostick",
          "Email: hosticktom@gmail.com",
          "",
          "07815695889 (Tom)",
          "07498286274 (Sean)"
        ].join("\n")
      )
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.customerPhone).toBe("07815695889");
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

  it("joins a pickup/drop-off address the form split across two physical lines", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "Pickup address: 56 Bucklebury",
          "Stanhope street, London, nw1 3lb",
          "Drop off address: 61",
          "Prince Court, London, nw1 4rb"
        ].join("\n")
      )
    );
    expect(parsed!.pickup).toBe("56 Bucklebury, Stanhope street, London, nw1 3lb");
    expect(parsed!.dropoff).toBe("61, Prince Court, London, nw1 4rb");
  });

  it("stops the address continuation at the next labelled field, not further down the description", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "Drop off address: 61",
          "Prince Court, London, nw1 4rb",
          "Floor to: 3rd floor",
          "Extra request: leave by the door"
        ].join("\n")
      )
    );
    expect(parsed!.dropoff).toBe("61, Prince Court, London, nw1 4rb");
    expect(parsed!.floorTo).toBe("3rd floor");
  });

  it("reads the real Rebekah Johnson booking whose 'Drop off:' address was split across two lines", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "ANY EXTRA CHARGE: £55 PER HALF AN HOUR",
          "",
          "Pick up address: 56 Bucklebury, Stanhope street, London, nw1 3lb",
          "",
          "Drop off: 61",
          "Tudor Road London E6 1DP",
          "",
          "",
          "Name: Rebekah Johnson",
          "Email Address: rebekah.kj.johnson@outlook.com",
          "Phone Number: 07539993764",
          "Move Date: 11/09/2026",
          "Van Size: Large - Luton Van",
          "Duration of Van Hire: 05 Hours",
          "Number of helpers: 2 Men - Client doesn't need to help",
          "",
          "Extra request: I don't need any extras"
        ].join("\n"),
        "2 men 295£/Y-TI1"
      )
    );
    expect(parsed!.pickup).toBe("56 Bucklebury, Stanhope street, London, nw1 3lb");
    expect(parsed!.dropoff).toBe("61, Tudor Road London E6 1DP");
  });

  it("captures van size, hire duration, extra request, inventory and the extra-charge rate", () => {
    const parsed = parseCalendarEvent(
      ev(
        [
          "ANY EXTRA CHARGE: £55 PER HALF AN HOUR",
          "Name: Helena Gray",
          "Van Size: Large - Luton Van",
          "Duration of Van Hire: 04 Hours",
          "Number of helpers: 2 Men - Client doesn't need to help",
          "Extra request: I don't need any extras",
          "Inventory item:",
          "Bed sofa table chairs benches sideboard coffee table"
        ].join("\n"),
        "£120 /Y-HE" // title has no crew -> falls back to "Number of helpers"
      )
    );
    expect(parsed!.vanSize).toBe("Large - Luton Van");
    expect(parsed!.hireDurationText).toBe("04 Hours");
    expect(parsed!.extraRequest).toBe("I don't need any extras");
    expect(parsed!.inventory).toBe("Bed sofa table chairs benches sideboard coffee table");
    expect(parsed!.extraChargeText).toBe("£55 PER HALF AN HOUR");
    expect(parsed!.crewSize).toBe(2);
  });

  it("syncs an invoice-billed booking tagged '/INV-XX' instead of '/Y-XX'", () => {
    const parsed = parseCalendarEvent(ev("Name: Rafi Ashfakul Hoque", "2 men/INV-TI"));
    expect(parsed).not.toBeNull();
    expect(parsed!.driverInitials).toBe("TI");
    expect(parsed!.paidOnline).toBe(false);
    expect(parsed!.crewSize).toBe(2);
  });

  it("strips rich-text HTML from rawDescription instead of leaving literal tags, and doesn't run a plain-text line into an HTML-wrapped one that follows it with no <br>", () => {
    // The exact rawDescription Calendar returned for a real booking (Rafi Ashfakul
    // Hoque, 2026-09-14): the first line is plain typed text, but Calendar auto-linked
    // the address right after it into a <p>, with no <br> or closing tag of its own
    // between the two -- which used to leave "ANY EXTRA CHARGE..." and "Move from..."
    // jammed onto one line in the driver app.
    const html =
      'ANY EXTRA CHARGE: £55 PER HALF AN HOUR<p><u></u> Move from:      ' +
      '<a href="https://www.google.com/maps/search/22+Roffey+Street+E14+3NH?entry=gmail&amp;source=g">22 Roffey Street E14 3NH</a>  </p>' +
      '<p>Move to:          <a href="https://www.google.com/maps/search/114,+Hylands+Road+41?entry=gmail&amp;source=g">114, Hylands Road 41</a> Goldfinch Apartments E17,4FZ</p>' +
      '<p><br></p><p>Name: Rafi Ashfakul Hoque <u></u></p><p>Tel: <a target="_blank"><u>+44 7362 208131</u></a></p>' +
      '<a href="https://mail.google.com/mail/u/0/?tab=rm&amp;ogbl#inbox/WhctKLcMbzJrTCBXXMcLbnNdpGXTWMDDQRNdPnSxNwgGPFTxKZlCLqzPgNsCtlnMLQxNkjQ">' +
      "https://mail.google.com/mail/u/0/?tab=rm&amp;ogbl#inbox/WhctKLcMbzJrTCBXXMcLbnNdpGXTWMDDQRNdPnSxNwgGPFTxKZlCLqzPgNsCtlnMLQxNkjQ</a>";

    const parsed = parseCalendarEvent(ev(html, "2 men/Y-TI"));
    expect(parsed).not.toBeNull();

    const lines = parsed!.rawDescription.split("\n").map(l => l.trim()).filter(Boolean);
    expect(lines.some(l => l.includes("<") || l.includes(">"))).toBe(false); // no literal HTML tag survives
    expect(lines[0]).toBe("ANY EXTRA CHARGE: £55 PER HALF AN HOUR"); // on its own line now
    expect(lines).toContain("Move from:      22 Roffey Street E14 3NH");
    expect(lines.some(l => l.startsWith("Tel:"))).toBe(true);
    expect(lines.some(l => l.includes("mail.google.com"))).toBe(true); // link text preserved, plain
  });

  it("still rejects an unconfirmed '/N-XX' booking", () => {
    expect(parseCalendarEvent(ev("Name: A B", "2 men/N-HE"))).toBeNull();
  });
});
