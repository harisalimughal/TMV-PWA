import type { Target } from "./providers";

export const isLogsQuery = (query: string): boolean => query.trim().toLowerCase() === "logs";

/** Search-only destinations must not leak into Recently opened or quick links. */
export function isLogsDestination(target: Target): boolean {
  if (target.kind !== "href") return false;
  try { return new URL(target.href, window.location.origin).searchParams.get("section") === "logs"; }
  catch { return false; }
}
