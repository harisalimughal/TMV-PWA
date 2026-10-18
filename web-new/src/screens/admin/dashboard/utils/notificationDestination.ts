/**
 * Where a tapped notification opens in the driver app. Only the driver app's own routes are allowed,
 * so a notice can never send a driver to another site. The driver app reads `?tab=` on a cold start
 * (jobs, liability, van, profile) and `?tab=activity&job=<id>` for a job's messages.
 */
const TABS = ["jobs", "liability", "van", "profile", "activity"];
export const DEFAULT_DESTINATION = "/?tab=jobs";

/** Returns an error message, or "" when the destination is allowed. */
export function destinationProblem(value: string): string {
  const text = value.trim();
  if (!text) return "Enter where the notification should open.";
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || /[\s]/.test(text)) return "Use an app path such as /?tab=jobs.";
  let url: URL;
  try { url = new URL(text, "https://driver.invalid"); } catch { return "Use an app path such as /?tab=jobs."; }
  if (url.origin !== "https://driver.invalid" || url.pathname !== "/" || url.hash) return "Only the driver app's own screens can be opened.";
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => key !== "tab" && key !== "job")) return "Only ?tab= and ?job= are supported.";
  const tab = url.searchParams.get("tab");
  if (tab && !TABS.includes(tab)) return `Unknown screen. Choose one of: ${TABS.join(", ")}.`;
  if (url.searchParams.has("job") && tab !== "activity") return "?job= works only with ?tab=activity.";
  if (tab === "activity" && !url.searchParams.get("job")) return "?tab=activity needs a ?job= reference.";
  return "";
}
