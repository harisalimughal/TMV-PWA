import { describe, expect, it } from "vitest";
import {
  crewLabel,
  dayLabel,
  durationShort,
  isRunningLate,
  meaningfulRequest,
  priceLabel,
  routeSummary,
  timeWindow,
  townOf
} from "./jobFormat";

describe("jobFormat", () => {
  it("formats the booked window in London time, tolerating missing ends", () => {
    expect(timeWindow({ bookedStart: "2026-09-30T08:30:00+01:00", bookedFinish: "2026-09-30T11:30:00+01:00" })).toBe("08:30–11:30");
    expect(timeWindow({ bookedStart: "2026-09-30T08:30:00+01:00", bookedFinish: "" })).toBe("08:30");
    expect(timeWindow({ bookedStart: "", bookedFinish: "" })).toBe("Time TBC");
    expect(timeWindow({ bookedStart: "garbage", bookedFinish: "x" })).toBe("Time TBC");
  });

  it("labels today and tomorrow relative to now", () => {
    const now = new Date("2026-10-14T10:00:00+01:00");
    expect(dayLabel("2026-10-14T18:00:00+01:00", now)).toMatch(/^Today · Wed 14 Oct$/);
    expect(dayLabel("2026-10-15T08:00:00+01:00", now)).toMatch(/^Tomorrow · Thu 15 Oct$/);
    expect(dayLabel("2026-10-20T08:00:00+01:00", now)).toBe("Tue 20 Oct");
    expect(dayLabel("", now)).toBe("");
  });

  it("shortens durations and hides empty ones", () => {
    const at = (s: string, f: string) => ({ bookedStart: s, bookedFinish: f });
    expect(durationShort(at("2026-09-30T08:00:00Z", "2026-09-30T11:00:00Z"))).toBe("3h");
    expect(durationShort(at("2026-09-30T08:00:00Z", "2026-09-30T09:30:00Z"))).toBe("1h 30m");
    expect(durationShort(at("2026-09-30T08:00:00Z", "2026-09-30T08:45:00Z"))).toBe("45m");
    expect(durationShort(at("", ""))).toBeNull();
  });

  it("labels crew and price, hiding unknowns", () => {
    expect(crewLabel(2)).toBe("2 crew");
    expect(crewLabel(1)).toBe("1 person");
    expect(crewLabel(0)).toBeNull();
    expect(priceLabel(285)).toBe("£285");
    expect(priceLabel(62.5)).toBe("£62.50");
    expect(priceLabel(0)).toBeNull();
  });

  it("extracts a town for the route summary", () => {
    expect(townOf("22 Bridge Road, St Albans AL1 3RX")).toBe("St Albans");
    expect(townOf("7 Larch Close, London N1 7DP")).toBe("London");
    expect(townOf("The Wharf, 1 Dock Street, London, E1 8AL")).toBe("London");
    expect(townOf("Somewhere SW1A 1AA")).toBe("SW1A 1AA");
    expect(townOf("")).toBe("");
    expect(routeSummary({ pickup: "7 Larch Close, London N1 7DP", dropoff: "22 Bridge Road, St Albans AL1 3RX" })).toBe("London → St Albans");
    expect(routeSummary({ pickup: "1 A St, London N1 7DP", dropoff: "2 B St, London E1 8AL" })).toBe("Within London");
    expect(routeSummary({ pickup: "", dropoff: "" })).toBe("Addresses TBC");
  });

  it("flags a READY job only once it's past the grace period", () => {
    const now = new Date("2026-10-14T09:00:00Z");
    expect(isRunningLate({ status: "READY", bookedStart: "2026-10-14T08:30:00Z" }, now)).toBe(true);
    expect(isRunningLate({ status: "READY", bookedStart: "2026-10-14T08:50:00Z" }, now)).toBe(false);
    expect(isRunningLate({ status: "IN_PROGRESS", bookedStart: "2026-10-14T06:00:00Z" }, now)).toBe(false);
  });

  it("drops boilerplate extra requests", () => {
    expect(meaningfulRequest("I don't need any extras")).toBeNull();
    expect(meaningfulRequest("  ")).toBeNull();
    expect(meaningfulRequest("Bring a dolly")).toBe("Bring a dolly");
  });
});
