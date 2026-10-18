import { DateTime } from "luxon";
import { navigateTo, openJob, sectionHref } from "../navigation";

/**
 * Driver report tabs, as on the deployed dashboard: Jobs | Performance & Timings |
 * Payments | Comparison | Tunnel Charges | Congestion Charges.
 */
export const REPORT_TABS = ["jobs", "performance", "payments", "comparison", "tunnels", "congestion"] as const;
export type ReportTab = typeof REPORT_TABS[number];

/** Tab names used by earlier versions of this dashboard, kept so old links still work. */
export type LegacyReportTab = "summary" | "timings" | "road";

/**
 * Maps any `reportTab` value, current or legacy, to a tab. `paymentsMode=reconcile`
 * (the four-tab layout's reconciliation view) lands on Comparison, and `roadType`
 * picks Tunnel or Congestion for the old combined Road charges tab.
 */
export function resolveReportTab(raw: string | null, paymentsMode?: string | null, roadType?: string | null): ReportTab {
  switch (raw) {
    case "jobs": case "summary": return "jobs";
    case "performance": case "timings": return "performance";
    case "payments": return paymentsMode === "reconcile" ? "comparison" : "payments";
    case "comparison": return "comparison";
    case "tunnels": return "tunnels";
    case "congestion": return "congestion";
    case "road": return roadType === "congestion" ? "congestion" : "tunnels";
    default: return "jobs";
  }
}

/** Scoped report URL: driver, range and tab only -- nothing from the page it was opened from. */
export function driverReportHref(initials: string, from?: string, to?: string, tab: ReportTab | LegacyReportTab = "jobs") {
  return sectionHref("driverreport", { driver: initials, reportTab: resolveReportTab(tab), from, to });
}

export function navigateAdmin(href: string) { navigateTo(href); }

/** Legacy deep-link form for a job opened from a report. Kept for existing links and
 *  exports; in-app, reports now open the job as an overlay via {@link openReportJob}. */
export function reportJobHref(id: string, finished = true) {
  const source = new URL(window.location.href);
  source.searchParams.delete("job"); source.searchParams.delete("reportReturn");
  const url = new URL(source);
  for (const key of Array.from(url.searchParams.keys())) url.searchParams.delete(key);
  url.searchParams.set("section", "jobs");
  if (finished) url.searchParams.set("status", "completed");
  url.searchParams.set("job", id);
  if (source.searchParams.get("section") === "driverreport") url.searchParams.set("reportReturn", source.pathname + source.search);
  return url.pathname + url.search;
}

/** Opens a job over the report itself, so closing it returns to the same tab, page and scroll. */
export function openReportJob(id: string) { openJob(id); }

/** Validated same-origin report URL from a legacy `reportReturn` param, or null. */
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
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
}
/**
 * Date range contract, by endpoint (inferred from the existing call sites and the mock API that models the
 * backend; the backend is not in this repository, so this is not verified against it):
 *
 *  - Driver reports (`/api/admin/driver-reports/...`, and their PDF/XLSX exports): `to` is EXCLUSIVE. The
 *    dashboard's range ends at the last millisecond of the last London day, so one millisecond is added and
 *    the server sees the next London midnight. A bare YYYY-MM-DD is passed through for the server to expand.
 *  - Jobs list (`/api/admin/jobs`, `/api/admin/jobs/export.csv`): both ends INCLUSIVE; `to` is that last
 *    millisecond as it is, which is what the Jobs page sends.
 *
 * Every report entry point converts through one of these two functions, so the same London days are covered
 * whichever endpoint is asked (tested across clock changes and month ends in reportDateContract.test.ts).
 */
export function reportApiRange(from: string, to: string) {
  return { from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : DateTime.fromISO(to).plus({ milliseconds: 1 }).toUTC().toISO()! };
}
export function jobsListRange(from: string, to: string) {
  const edge = (value: string, end: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? DateTime.fromISO(value, { zone: "Europe/London" })[end ? "endOf" : "startOf"]("day").toUTC().toISO()! : value;
  return { from: edge(from, false), to: edge(to, true) };
}
export function londonDateInput(value?: string) { return value ? DateTime.fromISO(value, { zone: "Europe/London" }).setZone("Europe/London").toISODate() || "" : ""; }
