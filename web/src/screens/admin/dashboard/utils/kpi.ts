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
