/**
 * URLs that tie the Activity screen to the Notifications composer. The composer opens locked to ONE
 * driver and one job, so a direct message can never be turned into an all-driver broadcast, and it
 * returns to the same conversation afterwards.
 */
export interface ComposeTarget { driver: string; jobId: string }

export const activityHref = (jobId?: string): string => `?section=activity${jobId ? `&conversation=${encodeURIComponent(jobId)}` : ""}`;

/** Where the "Message Driver" button goes. */
export function messageDriverHref(target: ComposeTarget): string {
  const params = new URLSearchParams({ section: "alerts", compose: "driver", msgDriver: target.driver, msgJob: target.jobId });
  return `?${params.toString()}`;
}

/** Reads the composer target from the current URL. Both values are required; anything else is not a direct message. */
export function composeTargetFrom(search: string): ComposeTarget | null {
  const params = new URLSearchParams(search);
  if (params.get("compose") !== "driver") return null;
  const driver = (params.get("msgDriver") ?? "").trim(), jobId = (params.get("msgJob") ?? "").trim();
  return driver && jobId ? { driver, jobId } : null;
}
