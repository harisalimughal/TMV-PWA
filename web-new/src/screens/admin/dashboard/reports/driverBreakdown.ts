/**
 * Data for the Driver Breakdown PDF: the same backend report the Driver Report page
 * reads, gathered for the whole selected range rather than one page.
 *
 * - every job (detail "full": timings, movement, finance, manual details, road alerts),
 *   paged at 100 per request up to MAX_JOBS;
 * - the tunnel and the congestion zone events with their own summaries, each loaded
 *   with its `activityScheme` exactly as the Tunnel / Congestion tabs do.
 *
 * Nothing is recalculated here: totals are the server's summary values. The PDF and
 * the screen therefore show the same figures for the same driver and range.
 */
import type { DriverReport, DriverReportJob, ReportRoadAlert } from "../driverReport.types";
import { fetchDriverReport } from "../api";
import { reportApiRange } from "../utils/reportNavigation";

export const MAX_JOBS = 1000;
const PAGE_SIZE = 100;
const MAX_ALERT_PAGES = 20;

type Load = (initials: string, query: Record<string, string | number>, signal?: AbortSignal) => Promise<DriverReport>;

export interface SchemeActivity {
  entries: number | null;
  chargeable: number | null;
  expectedKnownPence: number | null;
  unpriced: number;
  rows: ReportRoadAlert[];
  /** False when the server returned no tracker history for this scheme. */
  available: boolean;
}

export interface DriverBreakdown {
  report: DriverReport;
  jobs: DriverReportJob[];
  jobsTotal: number;
  tunnel: SchemeActivity;
  congestion: SchemeActivity;
  from: string;
  to: string;
  generatedAt: string;
  warnings: string[];
}

async function schemeActivity(initials: string, base: Record<string, string | number>, scheme: "tunnel" | "congestion", load: Load, signal?: AbortSignal): Promise<SchemeActivity> {
  const first = await load(initials, { ...base, activityScheme: scheme, jobsPage: 1, roadAlertsPage: 1 }, signal);
  if (!first.roadAlerts) return { entries: null, chargeable: null, expectedKnownPence: null, unpriced: 0, rows: [], available: false };
  const rows = [...first.roadAlerts.items];
  const pages = Math.min(MAX_ALERT_PAGES, Math.ceil(first.roadAlerts.total / Math.max(1, first.roadAlerts.pageSize)));
  for (let page = 2; page <= pages; page++) {
    const next = await load(initials, { ...base, activityScheme: scheme, jobsPage: 1, roadAlertsPage: page }, signal);
    rows.push(...(next.roadAlerts?.items ?? []));
  }
  const summary = first.roadAlertSummary;
  return { entries: summary?.entries ?? rows.length, chargeable: summary?.chargeableEntries ?? null, expectedKnownPence: summary?.estimatedKnownPence ?? null, unpriced: summary?.unpricedEntries ?? 0, rows, available: true };
}

export async function loadDriverBreakdown(initials: string, from: string, to: string, options: { load?: Load; signal?: AbortSignal; now?: () => Date; onProgress?: (done: number, total: number) => void } = {}): Promise<DriverBreakdown> {
  const load = options.load ?? fetchDriverReport;
  const base = { ...reportApiRange(from, to), groupBy: "day", pageSize: PAGE_SIZE, detail: "full" };
  const first = await load(initials, { ...base, activityScheme: "all", jobsPage: 1 }, options.signal);
  const jobs = [...first.jobs.items];
  // Page by the size the server actually used: it may cap the requested size.
  const pages = Math.ceil(Math.min(first.jobs.total, MAX_JOBS) / Math.max(1, first.jobs.pageSize || PAGE_SIZE));
  options.onProgress?.(1, pages);
  for (let page = 2; page <= pages; page++) {
    const next = await load(initials, { ...base, activityScheme: "all", jobsPage: page }, options.signal);
    if (!next.jobs.items.length) break;
    jobs.push(...next.jobs.items);
    options.onProgress?.(page, pages);
  }
  const [tunnel, congestion] = await Promise.all([schemeActivity(initials, base, "tunnel", load, options.signal), schemeActivity(initials, base, "congestion", load, options.signal)]);
  const warnings: string[] = [];
  if (jobs.length < first.jobs.total) warnings.push(`Only the first ${jobs.length} of ${first.jobs.total} jobs are listed. Range totals still cover every job.`);
  if (first.meta.gpsIncluded === false) warnings.push("Tracker detail was not included by the server, so moving time and zone activity may be incomplete.");
  return { report: first, jobs, jobsTotal: first.jobs.total, tunnel, congestion, from, to, generatedAt: (options.now?.() ?? new Date()).toISOString(), warnings };
}
