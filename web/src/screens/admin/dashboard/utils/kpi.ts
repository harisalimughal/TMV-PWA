/**
 * Dashboard KPI helpers.
 *
 * These exist so the numbers on the Overview page are honest: where a metric has no
 * defined value (e.g. a rate with a zero denominator) the helper returns `null` and
 * the UI shows "N/A", rather than substituting a plausible-looking figure.
 */

/**
 * Percentage of jobs completed, 0-100 (rounded), or `null` when there are no jobs in
 * range. `completed / 0` is undefined, and any stand-in number here would be invented
 * performance -- so the caller must render `null` as "N/A" / "—".
 */
export function completionRate(completed: number, totalJobs: number): number | null {
  if (!Number.isFinite(totalJobs) || totalJobs <= 0) return null;
  const done = Number.isFinite(completed) && completed > 0 ? completed : 0;
  return Math.round((Math.min(done, totalJobs) / totalJobs) * 100);
}

/** "150 mins" reads fine for one job but not for a summed total -- "2h 30m" (or just
 *  "45m" under an hour) matches how a Completed Jobs/Revenue total reads as a rounded
 *  figure, not a per-job average. Falls back to 0 for a non-finite input (e.g. a
 *  browser still running a cached bundle from before totalDurationMinutes existed in
 *  the API response) instead of rendering "NaNh NaNm". */
export function formatDuration(totalMinutes: number): string {
  const safeMinutes = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  const hrs = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}
