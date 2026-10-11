import { DateTime } from "luxon";
export function driverReportHref(initials: string, from?: string, to?: string, tab = "performance") {
  const url = new URL(window.location.href);
  url.searchParams.set("section", "driverreport"); url.searchParams.set("driver", initials); url.searchParams.set("reportTab", tab);
  url.searchParams.delete("job");
  url.searchParams.delete("reportReturn");
  for (const key of ["jobsPage", "eventsPage", "visitsPage", "chargesPage", "liabilitiesPage", "roadAlertsPage"]) url.searchParams.delete(key);
  if (from) url.searchParams.set("from", from); else url.searchParams.delete("from");
  if (to) url.searchParams.set("to", to); else url.searchParams.delete("to");
  return url.pathname + url.search;
}
export function navigateAdmin(href: string) { window.history.pushState({}, "", href); window.dispatchEvent(new PopStateEvent("popstate")); }
export function reportJobHref(id: string, finished = true) {
  const source = new URL(window.location.href);
  source.searchParams.delete("job"); source.searchParams.delete("reportReturn");
  const url = new URL(source);
  url.searchParams.set("section", finished ? "finished" : "jobs"); url.searchParams.set("job", id);
  if (source.searchParams.get("section") === "driverreport") url.searchParams.set("reportReturn", source.pathname + source.search);
  return url.pathname + url.search;
}
export function reportReturnHref(): string | null {
  const raw = new URLSearchParams(window.location.search).get("reportReturn");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.searchParams.get("section") !== "driverreport" ||
      !/^[A-Z0-9_-]{1,24}$/.test(url.searchParams.get("driver") || "")) return null;
    url.searchParams.delete("job"); url.searchParams.delete("reportReturn");
    return url.pathname + url.search;
  } catch { return null; }
}
export function retainRangeInUrl(from?: string, to?: string) {
  const url = new URL(window.location.href);
  for (const [key, value] of [["from", from], ["to", to]]) { if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!); }
  window.history.replaceState({}, "", url.pathname + url.search);
}
export function reportApiRange(from: string, to: string) {
  return { from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : DateTime.fromISO(to).plus({ milliseconds: 1 }).toUTC().toISO()! };
}
export function londonDateInput(value?: string) { return value ? DateTime.fromISO(value, { zone: "Europe/London" }).setZone("Europe/London").toISODate() || "" : ""; }
