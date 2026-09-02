import { describe, expect, it } from "vitest";
import type { Job } from "../api/jobs";
import {
  addDaysToKey,
  filterJobsByDate,
  formatDateKeyLong,
  formatDateKeyShort,
  londonDateKey,
  overdueJobs,
  todayKey
} from "./jobDates";

/** Minimal Job stub — only the fields jobDates reads. */
function job(id: string, bookedStart: string, status: Job["status"] = "READY"): Job {
  return { jobId: id, bookedStart, status } as Job;
}

// A fixed "now": 2026-09-04 18:00 UTC → still 4 Sep in Europe/London (BST, +1).
const NOW = new Date("2026-09-04T18:00:00Z");

describe("londonDateKey", () => {
  it("returns the Europe/London calendar date, not UTC", () => {
    // 23:30 UTC on 4 Sep is 00:30 on 5 Sep in London (BST).
    expect(londonDateKey("2026-09-04T23:30:00Z")).toBe("2026-09-05");
    expect(londonDateKey("2026-09-04T18:00:00Z")).toBe("2026-09-04");
  });

  it("is empty for an unparseable value", () => {
    expect(londonDateKey("not-a-date")).toBe("");
  });
});

describe("addDaysToKey", () => {
  it("adds whole calendar days and crosses month/year boundaries", () => {
    expect(addDaysToKey("2026-09-04", 1)).toBe("2026-09-05");
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("is stable across the UK DST change (26 Oct 2025)", () => {
    // No off-by-one when the clocks go back.
    expect(addDaysToKey("2025-10-25", 1)).toBe("2025-10-26");
    expect(addDaysToKey("2025-10-26", 1)).toBe("2025-10-27");
  });
});

describe("filterJobsByDate", () => {
  const jobs: Job[] = [
    job("today-a", "2026-09-04T08:30:00Z"),
    job("today-b", "2026-09-04T13:00:00Z"),
    job("tomorrow", "2026-09-05T09:00:00Z"),
    job("up-1", "2026-09-06T09:00:00Z"),
    job("up-2", "2026-09-06T14:00:00Z"),
    job("up-3", "2026-09-09T10:00:00Z"),
    job("past", "2026-09-01T10:00:00Z")
  ];

  it("buckets by London calendar day", () => {
    const r = filterJobsByDate(jobs, null, NOW);
    expect(r.today.map(j => j.jobId)).toEqual(["today-a", "today-b"]);
    expect(r.upcoming.map(j => j.jobId)).toEqual(["tomorrow", "up-1", "up-2", "up-3"]);
    expect(r.previous.map(j => j.jobId)).toEqual(["past"]);
    expect(r.counts).toEqual({ today: 2, upcoming: 4, previous: 1 });
  });

  it("sorts upcoming nearest-first and groups by date", () => {
    const r = filterJobsByDate(jobs, null, NOW);
    expect(r.upcomingGroups.map(g => g.key)).toEqual(["2026-09-05", "2026-09-06", "2026-09-09"]);
    expect(r.upcomingGroups[0].jobs.map(j => j.jobId)).toEqual(["tomorrow"]);
    expect(r.upcomingGroups[1].jobs.map(j => j.jobId)).toEqual(["up-1", "up-2"]);
    expect(r.upcomingGroups[2].jobs).toHaveLength(1);
  });

  it("custom bucket matches an exact day and includes past days", () => {
    expect(filterJobsByDate(jobs, "2026-09-01", NOW).custom.map(j => j.jobId)).toEqual([
      "past"
    ]);
    expect(filterJobsByDate(jobs, "2026-09-06", NOW).custom).toHaveLength(2);
    expect(filterJobsByDate(jobs, null, NOW).custom).toHaveLength(0);
  });
});

describe("overdueJobs", () => {
  it("returns past-day jobs that are not completed or cancelled", () => {
    const jobs: Job[] = [
      job("old-ready", "2026-09-01T10:00:00Z", "READY"),
      job("old-inprogress", "2026-09-02T10:00:00Z", "IN_PROGRESS"),
      job("old-done", "2026-09-01T10:00:00Z", "COMPLETED"),
      job("old-cancelled", "2026-09-01T10:00:00Z", "CANCELLED"),
      job("today", "2026-09-04T10:00:00Z", "READY")
    ];
    expect(overdueJobs(jobs, NOW).map(j => j.jobId)).toEqual([
      "old-ready",
      "old-inprogress"
    ]);
  });
});

describe("formatting", () => {
  it("formats keys without a timezone shift", () => {
    // 2026-09-05 is a Saturday; the exact day number/month must not drift.
    expect(formatDateKeyLong("2026-09-05")).toBe("5 September");
    expect(formatDateKeyShort("2026-09-05")).toMatch(/^Sat 5 Sept?$/);
  });
});

describe("todayKey", () => {
  it("matches the London date of the given instant", () => {
    expect(todayKey(NOW)).toBe("2026-09-04");
  });
});
