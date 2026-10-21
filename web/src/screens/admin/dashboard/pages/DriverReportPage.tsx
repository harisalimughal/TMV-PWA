/**
 * Driver report page: owns the report's URL state (driver, range, tab and each tab's
 * view) and its three data requests:
 *
 * 1. core  -- the paged report without tracker detail (fast; always loaded).
 * 2. display/activity -- movement and recorded road alerts without polygon processing, loaded in the background when
 *             the core response lacks them or a specific road scheme is selected.
 * 3. range -- completed jobs in the range without tracker processing, only for
 *             the Comparison tab, so its filters cover the whole selected period
 *             rather than one page.
 *
 * Tab names from the four-tab layout (summary, timings, road, payments with
 * paymentsMode=reconcile) are rewritten to the matching tab of the six.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDriverReport } from "../api";
import { DriverReportView, ReportHeader, type ReportViewLocation } from "../components/DriverReportView";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { reportApiRange, resolveReportTab } from "../utils/reportNavigation";
import { mergeReportGps } from "../utils/mergeReportGps";
import { downloadDriverReport } from "../utils/driverReportDownload";
import { loadDriverBreakdown, type DriverBreakdown } from "../reports/driverBreakdown";
import { PaperDriverBreakdown } from "../reports/PaperDriverBreakdown";
import { PrintPortal } from "../components/PrintPortal";
import { waitForPrintImages } from "../utils/printReady";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { navigateTo, openJob, sectionHref } from "../navigation";
import { Action, EmptyState, ErrorState, FilterSelect, LoadingState, PageHeader, panel } from "../components/ds";
import type { ReconFilter, ReportLocationPatch } from "../components/report/types";

const PAGE_KEYS = ["jobs", "events", "visits", "charges", "roadAlerts"] as const;
const RECON_MAX = 500;
const REPORT_PAGE_MAX = 200;

interface PageState extends ReportViewLocation { driver: string; from: string; to: string; pages: Record<string, number>; sortDir: "asc" | "desc" }

function readState(): PageState {
  const params = new URLSearchParams(window.location.search), fallback = dateRangeForPreset("7d");
  const filter = params.get("reconFilter");
  return {
    driver: params.get("driver") || "",
    from: params.get("from") || fallback.from!, to: params.get("to") || fallback.to!,
    tab: resolveReportTab(params.get("reportTab"), params.get("paymentsMode"), params.get("roadType")),
    reconFilter: (["review", "missing", "differences", "all"].includes(filter || "") ? filter : "all") as ReconFilter,
    roadView: params.get("roadView") === "jobs" ? "jobs" : "events",
    expand: params.get("expand") || undefined,
    sortDir: params.get("sortDir") === "desc" ? "desc" : "asc",
    pages: Object.fromEntries(PAGE_KEYS.map(key => [key, Math.max(1, Number(params.get(`${key}Page`) || 1))]))
  };
}

export function DriverReportPage({ loadReport = fetchDriverReport }: { loadReport?: typeof fetchDriverReport } = {}) {
  const [state, setState] = useState(readState);
  const roster = useDriverOptions();
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "breakdown" | null>(null);
  const [printing, setPrinting] = useState<DriverBreakdown | null>(null);
  const [exportError, setExportError] = useState("");
  const exportController = useRef<AbortController | null>(null);

  // Canonicalise legacy tab names once, without adding a history entry.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("reportTab");
    const resolved = resolveReportTab(raw, params.get("paymentsMode"), params.get("roadType"));
    if ((raw && raw !== resolved) || params.has("paymentsMode") || params.has("roadType")) {
      params.set("reportTab", resolved);
      params.delete("paymentsMode"); params.delete("roadType");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
    }
    const read = () => setState(readState());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => () => exportController.current?.abort(), []);
  useEffect(() => { exportController.current?.abort(); exportController.current = null; setExporting(null); setExportError(""); }, [state.driver, state.from, state.to]);

  /** Writes report state to the URL. Tab and mode changes push history (Back returns
   *  to the previous tab); paging and expanding replace it. */
  const update = (values: Record<string, string | number | undefined>, { resetPages = false, push = true } = {}) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) { if (value === undefined || value === "") url.searchParams.delete(key); else url.searchParams.set(key, String(value)); }
    if (resetPages) for (const key of PAGE_KEYS) url.searchParams.delete(`${key}Page`);
    const href = url.pathname + url.search;
    if (href === window.location.pathname + window.location.search) return;
    if (push) navigateTo(href);
    else { window.history.replaceState(window.history.state, "", href); setState(readState()); }
  };
  const onLocation = (patch: ReportLocationPatch) => {
    const values: Record<string, string | undefined> = {};
    if (patch.tab) values.reportTab = patch.tab;
    if (patch.reconFilter) values.reconFilter = patch.reconFilter === "all" ? undefined : patch.reconFilter;
    if (patch.roadView) values.roadView = patch.roadView === "events" ? undefined : patch.roadView;
    if (patch.expand !== undefined) values.expand = patch.expand || undefined;
    if (patch.sortDir) values.sortDir = patch.sortDir === "asc" ? undefined : patch.sortDir;
    const onlyExpand = Object.keys(patch).length === 1 && patch.expand !== undefined;
    update(values, { push: !onlyExpand, resetPages: !!patch.sortDir || patch.tab === "tunnels" || patch.tab === "congestion" });
  };

  const range = reportApiRange(state.from, state.to);
  const activityScheme = state.tab === "tunnels" ? "tunnel" : state.tab === "congestion" ? "congestion" : "all";
  const pageParams = Object.fromEntries(Object.entries(state.pages).map(([key, value]) => [`${key}Page`, value]));
  const coreQuery = useQuery({
    queryKey: ["driver_report", state.driver, state.from, state.to, "core", state.pages.jobs, state.sortDir],
    queryFn: ({ signal }) => loadReport(state.driver, { ...range, groupBy: "day", pageSize: 25, detail: "core", activityScheme: "all", ...pageParams, sortDir: state.sortDir }, signal),
    enabled: !!state.driver, retry: 1, staleTime: 30_000, gcTime: 5 * 60_000
  });
  const completed = coreQuery.data?.summary.completedJobs ?? 0;
  const needsDetails = completed > 0 && (coreQuery.data?.meta.gpsIncluded === false || activityScheme !== "all");
  const gpsTab = ["jobs", "performance", "tunnels", "congestion"].includes(state.tab);
  const loadGpsDetails = needsDetails && gpsTab;
  const detailLevel = activityScheme === "all" ? "display" : "activity";
  const detailQuery = useQuery({
    queryKey: ["driver_report", state.driver, state.from, state.to, detailLevel, state.pages, activityScheme, state.sortDir],
    queryFn: ({ signal }) => loadReport(state.driver, { ...range, groupBy: "day", pageSize: 25, activityScheme, detail: detailLevel, ...pageParams, sortDir: state.sortDir }, signal),
    enabled: !!state.driver && coreQuery.isSuccess && loadGpsDetails, retry: 1, staleTime: 30_000, gcTime: 5 * 60_000
  });
  const reconEnabled = state.tab === "comparison" && completed > 0;
  const coreCoversComparison = !!coreQuery.data && coreQuery.data.jobs.items.length >= Math.max(completed, coreQuery.data.jobs.total);
  const reconSize = Math.min(RECON_MAX, Math.max(25, completed));
  const reconQuery = useQuery({
    queryKey: ["driver_report", state.driver, state.from, state.to, "reconcile-core", reconSize, state.sortDir],
    queryFn: async ({ signal }) => {
      const pageSize = Math.min(REPORT_PAGE_MAX, reconSize);
      const query = { ...range, groupBy: "day" as const, pageSize, detail: "core" as const, activityScheme: "all" as const, sortDir: state.sortDir };
      const first = await loadReport(state.driver, { ...query, jobsPage: 1 }, signal);
      const jobs = new Map(first.jobs.items.map(job => [job.jobId, job]));
      for (let page = 2; jobs.size < Math.min(first.jobs.total, RECON_MAX) && page <= Math.ceil(RECON_MAX / pageSize); page++) {
        const next = await loadReport(state.driver, { ...query, jobsPage: page }, signal);
        const before = jobs.size;
        for (const job of next.jobs.items) jobs.set(job.jobId, job);
        if (jobs.size === before) break;
      }
      return { ...first, jobs: { ...first.jobs, items: [...jobs.values()].slice(0, RECON_MAX) } };
    },
    enabled: !!state.driver && reconEnabled && !coreCoversComparison, retry: 1, staleTime: 30_000, gcTime: 5 * 60_000
  });

  const data = useMemo(() => coreQuery.data ? mergeReportGps(coreQuery.data, gpsTab && needsDetails ? detailQuery.data : undefined) : undefined, [coreQuery.data, detailQuery.data, gpsTab, needsDetails]);
  const gpsLoading = loadGpsDetails && !detailQuery.data && !detailQuery.isError;
  const gpsError = loadGpsDetails && detailQuery.isError ? (detailQuery.error as Error)?.message || "Movement and charge details could not be loaded." : undefined;
  const gpsAvailable = !gpsLoading && !gpsError && data?.meta.gpsIncluded !== false;
  const reconReport = coreCoversComparison ? coreQuery.data : reconQuery.data;

  /** "breakdown" builds the designed Driver Breakdown PDF here and opens the print
   *  dialog; "pdf" / "xlsx" download the server's own export. */
  const exportReport = async (format: "pdf" | "xlsx" | "breakdown") => {
    if (exportController.current) return;
    const controller = new AbortController(); exportController.current = controller; setExporting(format); setExportError("");
    try {
      if (format === "breakdown") {
        const data = await loadDriverBreakdown(state.driver, state.from, state.to, { load: loadReport, signal: controller.signal });
        if (controller.signal.aborted) return;
        setPrinting(data);
        document.body.classList.add("printing-report");
        await new Promise(resolve => window.setTimeout(resolve, 300));
        await waitForPrintImages("#tmv-print-portal, .print-content");
        window.print();
        document.body.classList.remove("printing-report");
        setPrinting(null);
      } else await downloadDriverReport(state.driver, state.from, state.to, "day", format, controller.signal);
    }
    catch (error) { if (!controller.signal.aborted) setExportError(error instanceof Error ? error.message : "Report download failed."); }
    finally { if (exportController.current === controller) { exportController.current = null; setExporting(null); } }
  };

  const toDrivers = () => navigateTo(sectionHref("drivers", { from: state.from, to: state.to }));
  const currentName = data?.driver.initials === state.driver ? data.driver.name : state.driver;
  const picker = (<>
    <FilterSelect label="Driver" value={state.driver} disabled={roster.isLoading} className="w-[220px]"
      onChange={driver => { if (driver) update({ driver, expand: undefined }, { resetPages: true }); }}
      options={[
        ...(state.driver && !roster.options.some(option => option.initials === state.driver) ? [{ value: state.driver, label: currentName || state.driver }] : []),
        ...roster.options.map(option => ({ value: option.initials, label: `${option.fullName || option.initials} (${option.initials})${option.active ? "" : " · deactivated"}` }))
      ]} />
    {roster.isError && <Action size="sm" onClick={() => void roster.refetch()}>Retry driver list</Action>}
  </>);
  const onDates = (from?: string, to?: string) => { if (from && to) update({ from, to, expand: undefined }, { resetPages: true }); };

  if (!state.driver) {
    return <>
      <PageHeader title="Driver Report" breadcrumbs={[{ label: "Drivers", onClick: toDrivers }, { label: "Report" }]} />
      <div className={panel}><EmptyState title="Choose a driver" message="Pick a driver to see their report." actions={<Action onClick={toDrivers}>Back to drivers</Action>} /></div>
    </>;
  }
  if (!data) {
    return <>
      <ReportHeader name={currentName || state.driver} initials={state.driver} onDrivers={toDrivers} actions={picker} />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-admin-line bg-surface p-2.5">
        <DateRangePicker presets="records" from={state.from} to={state.to} onChange={onDates} />
        <FilterSelect label="Date order" value={state.sortDir} onChange={value => onLocation({ sortDir: value as "asc" | "desc", expand: "" })}
          options={[{ value: "asc", label: "Ascending · oldest first" }, { value: "desc", label: "Descending · newest first" }]} className="w-[240px]" />
      </div>
      <div className={panel}>
        {coreQuery.isError ? <ErrorState title="Couldn't load this driver report" message={(coreQuery.error as Error)?.message} onRetry={() => void coreQuery.refetch()} />
          : <LoadingState label="Loading driver report" rows={6} />}
      </div>
    </>;
  }
  return (<>
    <DriverReportView report={data} location={state} from={state.from} to={state.to} driverPicker={picker}
      gps={{ loading: gpsLoading, error: gpsError, available: gpsAvailable, retry: () => void detailQuery.refetch() }}
      recon={{
        jobs: reconReport?.jobs.items ?? [], total: reconReport?.jobs.total ?? completed, loading: !reconReport && reconQuery.isFetching,
        gpsAvailable: !!reconReport && reconReport.meta.gpsIncluded !== false,
        error: !coreCoversComparison && reconQuery.isError ? (reconQuery.error as Error)?.message || "Request failed" : undefined, retry: () => void reconQuery.refetch()
      }}
      refreshing={coreQuery.isFetching}
      onLocation={onLocation} onDates={onDates}
      onPage={(key, page) => update({ [`${key}Page`]: page }, { push: false })}
      onJob={openJob} onDrivers={toDrivers}
      onExport={format => void exportReport(format)} exporting={exporting} exportError={exportError} />
    {printing && <PrintPortal><PaperDriverBreakdown data={printing} /></PrintPortal>}
  </>);
}
