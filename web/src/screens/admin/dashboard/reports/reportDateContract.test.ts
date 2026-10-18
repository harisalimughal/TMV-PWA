import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { jobsListRange, reportApiRange } from "../utils/reportNavigation";
import { customRange, periodRange, rangeDates } from "./reportPeriods";

/** The two endpoint rules, as the mock API (which models the backend) applies them. */
const driverReportIncludes = (iso: string, range: { from: string; to: string }) => { const r = reportApiRange(range.from, range.to); return iso >= r.from && iso < r.to; };
const jobsListIncludes = (iso: string, range: { from: string; to: string }) => { const r = jobsListRange(range.from, range.to); return iso >= r.from && iso <= r.to; };
const london = (date: string, time: string) => DateTime.fromISO(`${date}T${time}`, { zone: "Europe/London" }).toUTC().toISO()!;

describe("report date contract", () => {
  it("driver reports get the next London midnight as an exclusive end; the jobs list gets the last millisecond inclusively", () => {
    const range = customRange("2026-10-05", "2026-10-11") as { from: string; to: string };
    expect(reportApiRange(range.from, range.to)).toEqual({ from: "2026-10-04T23:00:00.000Z", to: "2026-10-11T23:00:00.000Z" });
    expect(jobsListRange(range.from, range.to)).toEqual({ from: "2026-10-04T23:00:00.000Z", to: "2026-10-11T22:59:59.999Z" });
  });

  it("both endpoints cover exactly the same London days at the edges, including the last day and the next midnight", () => {
    for (const [from, to] of [["2026-10-05", "2026-10-11"], ["2026-10-24", "2026-10-26"], ["2027-03-27", "2027-03-29"], ["2026-01-31", "2026-02-28"], ["2026-12-31", "2026-12-31"]]) {
      const range = customRange(from, to) as { from: string; to: string };
      const after = DateTime.fromISO(to, { zone: "Europe/London" }).plus({ days: 1 }).toISODate()!;
      const before = DateTime.fromISO(from, { zone: "Europe/London" }).minus({ days: 1 }).toISODate()!;
      for (const [label, instant, expected] of [
        ["first moment", london(from, "00:00:00.000"), true], ["last moment", london(to, "23:59:59.999"), true], ["midday of the last day", london(to, "12:00"), true],
        ["next midnight", london(after, "00:00:00.000"), false], ["just before the start", london(before, "23:59:59.999"), false]
      ] as const) {
        expect([label, driverReportIncludes(instant, range)]).toEqual([label, expected]);
        expect([label, jobsListIncludes(instant, range)]).toEqual([label, expected]);
      }
    }
  });

  it("a range that spans the October clock change keeps whole London days (25 hours on the 25th)", () => {
    const range = customRange("2026-10-24", "2026-10-26") as { from: string; to: string };
    expect(reportApiRange(range.from, range.to).to).toBe("2026-10-27T00:00:00.000Z");   // the GMT midnight after the 26th
    expect(range.from).toBe("2026-10-23T23:00:00.000Z");                                   // BST midnight
    expect(driverReportIncludes("2026-10-25T00:30:00.000Z", range)).toBe(true);           // 01:30 BST then the repeated hour
    expect(driverReportIncludes("2026-10-25T01:30:00.000Z", range)).toBe(true);           // 01:30 GMT
  });

  it("the Generate Report presets are the same instants the Jobs page filter uses", () => {
    for (const preset of ["7d", "month"] as const) {
      const jobs = dateRangeForPreset(preset);
      if (preset === "7d") expect(periodRange("7d")).toEqual({ from: jobs.from, to: jobs.to });
    }
  });

  it("expands a bare date for the jobs list in London time and leaves instants alone", () => {
    expect(jobsListRange("2026-07-01", "2026-07-03")).toEqual({ from: "2026-06-30T23:00:00.000Z", to: "2026-07-03T22:59:59.999Z" });
    expect(jobsListRange("2026-10-04T23:00:00.000Z", "2026-10-11T22:59:59.999Z")).toEqual({ from: "2026-10-04T23:00:00.000Z", to: "2026-10-11T22:59:59.999Z" });
    expect(rangeDates(jobsListRange("2026-07-01", "2026-07-03"))).toEqual({ first: "2026-07-01", last: "2026-07-03" });
  });
});
