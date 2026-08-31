/** Compact "time ago" for the last-update-check line. Not localised — matches the
 *  terse operational tone used elsewhere in the driver app. */
export function formatRelativeTime(epochMs: number | null, now: number = Date.now()): string {
  if (!epochMs) return "Never";
  const diff = Math.max(0, now - epochMs);
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(epochMs).toLocaleDateString();
}
