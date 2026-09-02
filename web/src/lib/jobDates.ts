/**
 * Calendar-day helpers for the Jobs screen's date filters.
 *
 * All comparisons run on "YYYY-MM-DD" keys computed in Europe/London — the app's
 * date convention (see api/jobs.ts, components/driver/JobTime.tsx). Keys are compared
 * as strings; because they're zero-padded, lexicographic order is chronological order.
 * No `+24h` arithmetic and no matching of formatted labels, so there are no
 * timezone / DST off-by-one-day bugs.
 */

import type { Job } from "../api/jobs";

const LONDON = "Europe/London";

/** "en-CA" formats as YYYY-MM-DD regardless of the user's locale. */
const KEY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type JobFilter = "today" | "upcoming" | "previous" | "custom";

export const JOB_FILTERS: JobFilter[] = ["today", "previous", "upcoming", "custom"];

/** Europe/London calendar date of an ISO timestamp as "YYYY-MM-DD"; "" if invalid. */
export function londonDateKey(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return KEY_FMT.format(d);
}

/** Today's key in Europe/London. */
export function todayKey(now: Date = new Date()): string {
  return KEY_FMT.format(now);
}

function keyToUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Add whole calendar days to a key. Pure calendar math — DST-safe. */
export function addDaysToKey(key: string, days: number): string {
  const dt = keyToUtcDate(key);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** "5 September" — for empty-state copy. */
export function formatDateKeyLong(key: string): string {
  if (!key) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(keyToUtcDate(key));
}

/** "Fri 5 Sep" — for the active Date pill and upcoming group headers. */
export function formatDateKeyShort(key: string): string {
  if (!key) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(keyToUtcDate(key));
}

function byStartAsc(a: Job, b: Job): number {
  return new Date(a.bookedStart).getTime() - new Date(b.bookedStart).getTime();
}

export interface DateGroup {
  key: string;
  label: string;
  jobs: Job[];
}

export interface FilteredJobs {
  today: Job[];
  /** Tomorrow onward, nearest first. */
  upcoming: Job[];
  /** `upcoming`, split into consecutive same-day groups. */
  upcomingGroups: DateGroup[];
  /** Past-day jobs still needing action (not completed/cancelled) — the Previous
   *  filter's contents. Same jobs `overdueJobs` returns; kept as its own function too
   *  since it's a natural standalone check ("is there anything overdue at all"). */
  previous: Job[];
  /** Jobs on `customKey` (any status), or [] when no custom date is set. */
  custom: Job[];
  counts: { today: number; upcoming: number; previous: number };
}

export function groupJobsByDate(jobs: Job[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const job of jobs) {
    const k = londonDateKey(job.bookedStart);
    if (!k) continue;
    const last = groups[groups.length - 1];
    if (last && last.key === k) {
      last.jobs.push(job);
    } else {
      groups.push({ key: k, label: formatDateKeyShort(k), jobs: [job] });
    }
  }
  return groups;
}

/**
 * Split a flat job list into the filter buckets. `customKey` is a "YYYY-MM-DD" key or
 * null. `now` is injectable for tests.
 */
export function filterJobsByDate(
  jobs: Job[],
  customKey: string | null,
  now: Date = new Date(),
): FilteredJobs {
  const tKey = todayKey(now);

  const today: Job[] = [];
  const upcoming: Job[] = [];
  const custom: Job[] = [];

  for (const job of jobs) {
    const k = londonDateKey(job.bookedStart);
    if (!k) continue;
    if (k === tKey) today.push(job);
    else if (k > tKey) upcoming.push(job);
    if (customKey && k === customKey) custom.push(job);
  }

  today.sort(byStartAsc);
  upcoming.sort(byStartAsc);
  custom.sort(byStartAsc);

  const upcomingGroups = groupJobsByDate(upcoming);

  const previous = overdueJobs(jobs, now);

  return {
    today,
    upcoming,
    upcomingGroups,
    previous,
    custom,
    counts: { today: today.length, upcoming: upcoming.length, previous: previous.length },
  };
}

/** Past-day jobs that still need action — the Previous filter's contents. */
export function overdueJobs(jobs: Job[], now: Date = new Date()): Job[] {
  const tKey = todayKey(now);
  return jobs
    .filter(j => {
      const k = londonDateKey(j.bookedStart);
      return (
        !!k && k < tKey && j.status !== "COMPLETED" && j.status !== "CANCELLED"
      );
    })
    .sort(byStartAsc);
}
