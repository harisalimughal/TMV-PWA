import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "../api";
import type { NormalizedJob } from "../types";

export const RANGE_PAGE_SIZE = 100;
/** Hard cap so a very wide custom range can't issue an unbounded number of requests. */
export const RANGE_MAX_PAGES = 30;

export interface RangeJobs {
  jobs: NormalizedJob[];
  /** Server's count of jobs in the range. */
  total: number;
  /** True when every job in the range was loaded; false means figures are partial. */
  complete: boolean;
}

/** Loads every job scheduled in [from, to], page by page, optionally for one driver (initials). */
export async function loadRangeJobs(from: string, to: string, load: typeof fetchJobs = fetchJobs, driver = "", includeMA = true): Promise<RangeJobs> {
  const byId = new Map<string, NormalizedJob>();
  let total = 0;
  for (let page = 1; page <= RANGE_MAX_PAGES; page += 1) {
    const res = await load({ from, to, page, pageSize: RANGE_PAGE_SIZE, sort: "bookedStart", dir: "asc", ...(driver ? { driver } : {}), ...(!includeMA ? { includeMA: "0" } : {}) });
    total = res.pagination?.total ?? res.items.length;
    const before = byId.size;
    for (const item of res.items) byId.set(item.jobId, item);
    // Stop on an empty page, a page with nothing new (server ignored paging), or once everything is loaded.
    if (!res.items.length || byId.size === before || byId.size >= total) break;
  }
  const jobs = Array.from(byId.values());
  return { jobs, total: Math.max(total, jobs.length), complete: jobs.length >= total };
}

/**
 * Range data for the overview. A new range is a new query key, so the previous
 * range's figures are never shown as the new range's; a background refresh of the
 * same range keeps its data visible and reports `isFetching`. `driver` (initials)
 * narrows the range to one driver's jobs; empty means all drivers.
 */
export function useRangeJobs(from: string, to: string, enabled = true, driver = "", includeMA = true) {
  return useQuery({ queryKey: ["range_jobs", from, to, driver, includeMA], queryFn: () => loadRangeJobs(from, to, fetchJobs, driver, includeMA), enabled, staleTime: 60_000 });
}
