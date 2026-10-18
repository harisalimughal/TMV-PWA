/**
 * Generate Report: one workspace dialog, opened from the Overview header and from a driver's
 * profile. Configuration on the left, the report preview and its status on the right (stacked on
 * a phone). Three report types, each backed by a working source:
 *
 *   Driver job report   built here from the backend driver report (reports/driverJobReport.ts),
 *                       downloadable as PDF, Excel, CSV or Word. Prepared first, so the
 *                       preview shows the real job count and totals before any download.
 *   Driver breakdown    the backend's own PDF/Excel export, the same file the Driver report
 *                       page's download gives (and the old dashboard's PDF button).
 *   Jobs list           the backend's jobs CSV export, as on the Jobs page.
 *
 * State: each generation runs from an immutable request snapshot (type, drivers, range).
 * The controls are locked while it loads, a generation counter plus an AbortController keep
 * a cancelled, closed or superseded request from committing late, and any edit after a
 * result discards that result, so the preview and the download always match the request
 * that produced them.
 *
 * Google Sheets and Docs: this dashboard has no Google sign-in, so it cannot create files
 * in a Google account. The Excel and Word files import into Sheets and Docs as they are.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { AlertTriangle, CalendarRange, Download, FileBarChart, FileText, Printer, RotateCcw } from "lucide-react";
import { Modal } from "../../../../ui/Modal";
import { cx } from "../../../../ui/cx";
import { Action, Badge, Notice, controlBase } from "../components/ds";
import { PrintPortal } from "../components/PrintPortal";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { waitForPrintImages } from "../utils/printReady";
import { printDocument } from "../utils/printSession";
import { downloadServerCsv } from "../utils/serverDownload";
import { downloadDriverReport } from "../utils/driverReportDownload";
import { jobsListRange } from "../utils/reportNavigation";
import { combinedSummary, compareJobs, loadDriverJobReport, reportFileName, reportStatus, retryFailedDrivers, totalJobs, formatValue, NOT_AVAILABLE, type DriverJobReport, type DriverLoadEvent, type DriverLoadKind, type SummaryLine } from "./driverJobReport";
import { MIME, saveFile, toCsv, toDocx, toXlsx, type ReportFormat } from "./exporters";
import { toPdf } from "./driverJobPdf";
import { PaperDriverJobReport } from "./PaperDriverJobReport";
import { MAX_REPORT_DAYS, PERIOD_LABELS, customRange, exceedsMaxDays, latestAllowedStart, periodRange, prefillPeriod, rangeLabel, type ReportPeriod } from "./reportPeriods";
import { DriverChecklist, EYEBROW, FORMAT_LABEL, FormatTiles, MetricCards, PillGroup, PreviewTable, ProgressPanel, Step, TypeCards, type Metric } from "./reportWorkspaceParts";
import type { Phase, PreviewNotice, ReportRequest, ReportType } from "./reportWorkspaceTypes";

export type { Phase, ReportRequest, ReportType } from "./reportWorkspaceTypes";

const TYPES: Record<ReportType, { label: string; hint: string; formats: ReportFormat[] }> = {
  "driver-jobs": { label: "Driver job report", hint: "Totals and a job-by-job list for one or more drivers.", formats: ["pdf", "xlsx", "docx", "csv"] },
  "driver-breakdown": { label: "Driver breakdown", hint: "Timings, performance and payments for one driver, from the server.", formats: ["pdf", "xlsx"] },
  "jobs-csv": { label: "Jobs list", hint: "The server's jobs export, one row per job. No totals section.", formats: ["csv"] }
};
const PERIODS: ReportPeriod[] = ["today", "yesterday", "thisWeek", "lastWeek", "7d", "thisMonth", "lastMonth", "custom"];
const PREVIEW_ROWS = 8;

export interface ReportInitial { from?: string; to?: string; drivers?: string[]; type?: ReportType }

/** Starting selections for each report type. Each type keeps its own driver draft, so a
 *  selection made for one type is never reinterpreted (or silently cut) by another. */
function initialDrafts(initial?: ReportInitial) {
  const drivers = initial?.drivers ?? [];
  const period = prefillPeriod(initial);
  return {
    type: initial?.type ?? "driver-jobs" as ReportType,
    jobsAll: !drivers.length, jobsPicked: [...drivers], jobsInactive: true,
    breakdownDriver: drivers.length === 1 ? drivers[0] : "",
    csvAll: !drivers.length, csvDriver: drivers.length === 1 ? drivers[0] : "",
    period: period.period, custom: { from: period.from, to: period.to },
    source: (initial?.from || initial?.to ? "overview" : "default") as "overview" | "default" | "user"
  };
}

export function GenerateReportModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: ReportInitial }) {
  const roster = useDriverOptions();
  const start = useMemo(() => initialDrafts(initial), [initial]);
  const [type, setType] = useState<ReportType>(start.type);
  // Driver drafts, one set per report type.
  const [jobsAll, setJobsAll] = useState(start.jobsAll);
  const [jobsPicked, setJobsPicked] = useState<string[]>(start.jobsPicked);
  const [jobsInactive, setJobsInactive] = useState(start.jobsInactive);
  const [breakdownDriver, setBreakdownDriver] = useState(start.breakdownDriver);
  const [csvAll, setCsvAll] = useState(start.csvAll);
  const [csvDriver, setCsvDriver] = useState(start.csvDriver);
  const [period, setPeriod] = useState<ReportPeriod>(start.period);
  const [custom, setCustom] = useState(start.custom);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [rangeSource, setRangeSource] = useState(start.source);
  const [notice, setNotice] = useState<PreviewNotice>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [printing, setPrinting] = useState<DriverJobReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  /** Bumped by every new, cancelled, reset or closed generation. A response commits only if it still holds the current number. */
  const generation = useRef(0);
  /** True from the moment Generate is accepted until that generation ends, so a second click in the same tick is ignored. */
  const active = useRef(false);

  /** Cancels whatever is running and makes any late response harmless. */
  const invalidate = () => { controller.current?.abort(); controller.current = null; generation.current += 1; active.current = false; };

  const applyDrafts = (drafts: ReturnType<typeof initialDrafts>) => {
    setType(drafts.type); setJobsAll(drafts.jobsAll); setJobsPicked(drafts.jobsPicked); setJobsInactive(drafts.jobsInactive); setBreakdownDriver(drafts.breakdownDriver);
    setCsvAll(drafts.csvAll); setCsvDriver(drafts.csvDriver); setPeriod(drafts.period); setCustom(drafts.custom); setFormat("pdf"); setRangeSource(drafts.source); setNotice(null); setPhase({ kind: "idle" });
  };

  // Each opening starts from what the caller passed (the Overview's filters, or a driver); closing cancels any run.
  useEffect(() => {
    invalidate();
    if (open) applyDrafts(initialDrafts(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => invalidate, []);

  const spec = TYPES[type];
  const effectiveFormat = spec.formats.includes(format) ? format : spec.formats[0];
  const range = period === "custom" ? customRange(custom.from, custom.to) : periodRange(period);
  const rangeError = "error" in range ? range.error : null;
  const tooLong = period === "custom" && exceedsMaxDays(custom.from, custom.to);
  const busy = phase.kind === "loading";

  // The driver list: loading, failed, empty, or available are four different things.
  const rosterLoading = roster.isLoading || (roster.isFetching === true && roster.isError);
  const rosterFailed = roster.isError && !roster.options.length && !rosterLoading;
  const rosterEmpty = !roster.isLoading && !roster.isError && !roster.options.length;
  const rosterCodes = useMemo(() => roster.options.map(option => option.initials), [roster.options]);

  const nameOf = (initials: string) => roster.options.find(option => option.initials === initials)?.fullName || initials;
  const label = (code: string) => `${nameOf(code)}${nameOf(code) === code ? "" : ` (${code})`}`;

  // What the current type will actually cover, and why it cannot run yet.
  const inactiveCodes = useMemo(() => roster.options.filter(option => !option.active).map(option => option.initials), [roster.options]);
  const selection: { allDrivers: boolean; drivers: string[]; excluded: string[]; problem: string | null; summary: string } = (() => {
    if (type === "driver-breakdown") {
      const drivers = breakdownDriver ? [breakdownDriver] : [];
      return { allDrivers: false, drivers, excluded: [], problem: drivers.length ? null : "Choose one driver.", summary: drivers.length ? label(drivers[0]) : "No driver chosen yet" };
    }
    if (type === "jobs-csv") {
      if (csvAll) return { allDrivers: true, drivers: [], excluded: [], problem: null, summary: "All drivers (chosen by the server)" };
      const drivers = csvDriver ? [csvDriver] : [];
      return { allDrivers: false, drivers, excluded: [], problem: drivers.length ? null : "Choose one driver.", summary: drivers.length ? label(drivers[0]) : "No driver chosen yet" };
    }
    if (jobsAll) {
      const problem = rosterLoading || roster.isLoading ? "The driver list is still loading." : rosterFailed ? "The driver list could not be loaded, so All drivers cannot be worked out. Retry the drivers or choose drivers." : rosterEmpty ? "There are no drivers on the roster." : null;
      const excluded = jobsInactive ? [] : inactiveCodes;
      const drivers = problem ? [] : rosterCodes.filter(code => !excluded.includes(code));
      const inactiveNote = inactiveCodes.length ? (jobsInactive ? `, including ${inactiveCodes.length} inactive` : `, ${inactiveCodes.length} inactive left out`) : "";
      return { allDrivers: true, drivers, excluded: problem ? [] : excluded, problem: problem ?? (drivers.length ? null : "Every driver is inactive and inactive drivers are left out. Include them to continue."), summary: problem ? "All drivers (not available yet)" : `All drivers (${drivers.length}${inactiveNote})` };
    }
    return { allDrivers: false, drivers: jobsPicked, excluded: [], problem: jobsPicked.length ? null : "Choose at least one driver.", summary: jobsPicked.length ? jobsPicked.map(label).join(", ") : "No drivers chosen yet" };
  })();
  const problem = rangeError ?? selection.problem;
  const canGenerate = !busy && !problem && !rangeError;

  /** Any edit discards a previous result (it no longer matches the form). Controls are locked while loading, so this never races a run. */
  const edit = () => {
    if (active.current) return;
    setPhase(current => { if (current.kind !== "idle") setNotice("changed"); return current.kind === "idle" ? current : { kind: "idle" }; });
    setExportError(null);
  };
  const guarded = <A extends unknown[]>(apply: (...args: A) => void) => (...args: A) => { if (active.current) return; apply(...args); edit(); };

  const cancelGeneration = () => {
    invalidate();
    setPhase(current => {
      if (current.kind === "loading" && current.resume) return { kind: "partial", request: current.request, report: current.resume };
      setNotice("cancelled");
      return { kind: "idle" };
    });
  };
  const close = () => { invalidate(); setPhase({ kind: "idle" }); setNotice(null); onClose(); };
  const resetForm = () => { invalidate(); applyDrafts(initialDrafts(initial)); };

  /** The one place a run starts, for a first load and for a retry of the failed drivers. */
  const run = async (request: ReportRequest, resume?: DriverJobReport) => {
    if (active.current) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const id = ++generation.current;
    active.current = true;
    setNotice(null);
    const live = () => generation.current === id && !abort.signal.aborted;
    const commit = (next: Phase) => { if (live()) setPhase(next); };
    const states: Record<string, DriverLoadKind> = {};
    const targets = resume ? (resume.failed ?? []).map(item => item.initials) : [...request.drivers];
    const onDriver = (event: DriverLoadEvent) => { states[event.initials] = event.kind; };
    const progress = (done: number) => commit({ kind: "loading", request, done, total: Math.max(1, targets.length), states: { ...states }, resume });
    try {
      progress(0);
      if (request.type === "driver-jobs") {
        const options = { signal: abort.signal, continueOnError: true, dropEmpty: request.allDrivers, excluded: [...request.excluded], onDriver, onProgress: (done: number) => progress(done) };
        const report = resume ? await retryFailedDrivers(resume, options) : await loadDriverJobReport([...request.drivers], request.range, options);
        commit({ kind: report.failed?.length ? "partial" : "ready", request, report });
      } else if (request.type === "driver-breakdown") {
        await downloadDriverReport(request.drivers[0], request.range.from, request.range.to, "day", effectiveFormat as "pdf" | "xlsx", abort.signal);
        commit({ kind: "done", request, message: `Downloaded the ${FORMAT_LABEL[effectiveFormat]} driver breakdown for ${nameOf(request.drivers[0])}.` });
      } else {
        const params = new URLSearchParams(jobsListRange(request.range.from, request.range.to));
        if (!request.allDrivers && request.drivers[0]) params.set("driver", request.drivers[0]);
        await downloadServerCsv(`/api/admin/jobs/export.csv?${params.toString()}`, "tmv-jobs.csv", abort.signal);
        commit({ kind: "done", request, message: "Downloaded the server's jobs CSV." });
      }
    } catch (error) {
      commit({ kind: "error", request, message: (error as Error)?.message || "The report could not be generated. Please retry." });
    } finally {
      if (generation.current === id) { active.current = false; controller.current = null; }
    }
  };

  const prepare = () => {
    if (active.current || !canGenerate || "error" in range) return;
    // The immutable snapshot this whole run uses, whatever the form does meanwhile.
    void run(Object.freeze({ type, allDrivers: selection.allDrivers, drivers: Object.freeze([...selection.drivers]), excluded: Object.freeze([...selection.excluded]), range: Object.freeze({ from: range.from, to: range.to }) }));
  };
  /** Loads only the drivers that failed and merges them into the partial report, which is kept until then. */
  const retryFailed = () => { if (phase.kind === "partial") void run(phase.request, phase.report); };
  const discardPartial = () => { if (phase.kind === "partial") setPhase({ kind: "idle" }); };

  /** Writes the chosen file. Every format, the PDF included, is built here with a fixed name from the report itself. */
  const download = (report: DriverJobReport) => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = effectiveFormat === "pdf" ? toPdf(report) : effectiveFormat === "csv" ? toCsv(report) : effectiveFormat === "xlsx" ? toXlsx(report) : toDocx(report);
      saveFile(data as BlobPart, MIME[effectiveFormat], reportFileName(report, effectiveFormat));
    } catch (error) {
      setExportError(`The ${FORMAT_LABEL[effectiveFormat]} file could not be created: ${(error as Error)?.message || "unknown error"}.`);
    } finally { setExporting(false); }
  };

  /** Browser printing is its own action: it opens the print dialog on the on-page copy of the report. */
  const printReport = (report: DriverJobReport) => {
    if (printing || exporting) return;
    setExportError(null);
    setPrinting(report);
  };
  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    // The portal mounted in this commit; print once images are in and the document has been laid out.
    void printDocument({ title: reportFileName(printing, "pdf").replace(/\.pdf$/, ""), ready: () => waitForPrintImages("#tmv-print-portal, .print-content") })
      .catch(error => { if (!cancelled) setExportError(`Printing failed: ${(error as Error)?.message || "unknown error"}.`); })
      .finally(() => { if (!cancelled) setPrinting(null); });
    return () => { cancelled = true; };
  }, [printing]);

  const result = phase.kind === "ready" || phase.kind === "partial" ? phase : null;
  const ready = result?.report ?? null;
  const jobCount = ready ? totalJobs(ready) : 0;
  const status = ready ? reportStatus(ready) : null;
  const totals = ready ? (combinedSummary(ready) ?? ready.sections[0]?.summary ?? []) : [];
  const metricFor = (key: string, label: string): Metric => {
    const line: SummaryLine | undefined = totals.find(item => item.key === key);
    if (!line || line.coverage === "unavailable" || line.value === null) return { label, value: NOT_AVAILABLE, missing: true, detail: line?.knownSubtotal != null ? `Known subtotal ${formatValue(line.knownSubtotal, line.unit)}` : undefined };
    return { label, value: formatValue(line.value, line.unit), detail: line.coverage === "known-only" ? "Known values only" : undefined };
  };
  const metrics: Metric[] = ready ? [
    { label: "Jobs", value: String(jobCount), detail: phase.kind === "partial" ? "Loaded drivers only" : undefined },
    metricFor("completed", "Completed"), metricFor("final", "Final charges"), metricFor("working", "Working time")
  ] : [];
  const previewRows = ready ? ready.sections.flatMap(section => section.jobs.map(line => ({ driver: section.driver.initials, line }))).sort((a, b) => compareJobs(a.line, b.line)).slice(0, PREVIEW_ROWS) : [];
  const requestDrivers = (request: ReportRequest) => request.type === "jobs-csv" && request.allDrivers ? "All drivers (chosen by the server)" : request.allDrivers ? `All drivers (${request.drivers.length})` : request.drivers.map(label).join(", ") || "None";

  // When a run ends the Generate button is gone: move focus to the preview heading (unless the user moved on) and bring it into view.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const lastKind = useRef(phase.kind);
  useEffect(() => {
    const was = lastKind.current;
    lastKind.current = phase.kind;
    if (was === phase.kind || !["ready", "partial", "error", "done"].includes(phase.kind)) return;
    const focused = document.activeElement;
    // Nothing in particular focused (body, the dialog itself, or the button that has just changed): the result is where attention goes.
    if (!focused || focused === document.body || focused.getAttribute("role") === "dialog" || footerRef.current?.contains(focused)) headingRef.current?.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paneRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [phase.kind]);

  // Notices carry their own role (alert or status) and are announced by it; this line covers the results that have none.
  const announce = phase.kind === "ready" ? `Report ready: ${jobCount} ${jobCount === 1 ? "job" : "jobs"} for ${requestDrivers(phase.request)}.` : "";

  const pickDriver = (value: string, set: (code: string) => void) => (
    <select aria-label="Driver" value={value} onChange={event => guarded(set)(event.target.value)} className={cx(controlBase, "w-full")}>
      <option value="">Choose a driver</option>
      {roster.options.map(option => <option key={option.initials} value={option.initials}>{option.fullName || option.initials} ({option.initials}){option.active ? "" : " (inactive)"}</option>)}
    </select>
  );
  const allOrOne = (all: boolean, setAll: (value: boolean) => void, oneLabel: string) => (
    <PillGroup name="driver-mode" legend="Which drivers" value={all ? "all" : "some"} onChange={value => guarded(setAll)(value === "all")} options={[{ value: "all", label: "All drivers" }, { value: "some", label: oneLabel }]} />
  );
  const primaryLabel = type === "driver-jobs" ? "Generate Preview" : `Download ${FORMAT_LABEL[effectiveFormat]}`;
  const statusBadge = busy ? <Badge tone="info">Generating</Badge>
    : phase.kind === "partial" ? <Badge tone="warning">Partial</Badge>
    : phase.kind === "ready" ? (jobCount === 0 ? <Badge tone="neutral">Complete, no jobs</Badge> : status?.status === "PARTIAL" ? <Badge tone="warning">Partial</Badge> : <Badge tone="success">Complete</Badge>)
    : phase.kind === "error" ? <Badge tone="danger">Not generated</Badge> : phase.kind === "done" ? <Badge tone="success">Downloaded</Badge> : <Badge tone="neutral">Not generated yet</Badge>;
  const problems = [rangeError, selection.problem].filter((item): item is string => !!item);
  const previewTitle = busy ? "Preparing your report" : ready ? ready.title : phase.kind === "error" ? "Report not generated" : phase.kind === "done" ? "Report downloaded" : "Your report preview will appear here.";

  const recap = (request: ReportRequest) => (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)]">
      <dt className="text-admin-ink-2">Report</dt><dd className="font-medium text-admin-ink">{TYPES[request.type].label}</dd>
      <dt className="text-admin-ink-2">Drivers</dt><dd className="min-w-0 break-words font-medium text-admin-ink">{requestDrivers(request)}</dd>
      <dt className="text-admin-ink-2">Period</dt><dd className="font-medium text-admin-ink">{`${rangeLabel(request.range)}, London time`}</dd>
    </dl>
  );

  return (
    <>
      <Modal open={open} onClose={close} title="Generate Report" size="3xl" dismissible={!busy}
        footer={<div ref={footerRef} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* On a phone the main action comes first and fills the width; from sm up it sits at the right. */}
          <div className="order-1 sm:order-3 [&>button]:w-full sm:[&>button]:w-auto">
            {ready
              ? <Action variant="primary" icon={<Download />} disabled={!!printing || exporting} onClick={() => download(ready)}>{phase.kind === "partial" ? `Download partial ${FORMAT_LABEL[effectiveFormat]}` : `Download ${FORMAT_LABEL[effectiveFormat]}`}</Action>
              : <Action variant="primary" icon={type === "driver-jobs" ? <FileText /> : <Download />} loading={busy} disabled={!canGenerate} onClick={prepare}>{primaryLabel}</Action>}
          </div>
          <div className="order-2 flex items-center justify-between gap-2 sm:contents">
            <div className="sm:order-1 sm:mr-auto">{!busy && <Action variant="ghost" icon={<RotateCcw />} onClick={resetForm}>Reset</Action>}</div>
            <div className="flex items-center gap-2 sm:order-2">
              {busy ? <Action variant="ghost" onClick={cancelGeneration}>Cancel generation</Action> : <Action variant="ghost" onClick={close}>Cancel</Action>}
              {ready && type === "driver-jobs" && <Action variant="secondary" icon={<Printer />} disabled={!!printing || exporting} onClick={() => printReport(ready)}>{printing ? "Printing…" : "Print report"}</Action>}
            </div>
          </div>
        </div>}>
        <p className="mb-4 text-[13.5px] text-admin-ink-2">Choose what to include, preview the result, then download or print it.</p>
        <div aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
          {/* ------------------------------------------------------------- configuration */}
          <fieldset disabled={busy} aria-busy={busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <legend className="sr-only">Report options</legend>
            <Step n={1} title="Report type">
              <TypeCards value={type} onChange={value => guarded(setType)(value)} options={(Object.keys(TYPES) as ReportType[]).map(value => ({ value, label: TYPES[value].label, hint: TYPES[value].hint }))} />
            </Step>

            <Step n={2} title={type === "driver-jobs" ? "Drivers" : "Driver"}
              hint={<>
                <p>This report will cover: <span className="font-medium text-admin-ink">{selection.summary}</span></p>
                {type !== "driver-jobs" && jobsPicked.length > 1 && !jobsAll && <p className="mt-1">Your {jobsPicked.length}-driver choice is kept for the Driver job report; this report type covers one driver.</p>}
              </>}>
              {rosterLoading || roster.isLoading ? <p className="text-[13px] text-admin-ink-2">Loading drivers…</p>
                : rosterFailed ? (
                  <Notice tone="danger" title="Couldn't load drivers" action={<Action size="sm" onClick={() => void roster.refetch?.()}>Retry drivers</Action>}>
                    The driver list is needed to choose drivers or to report on all of them, so Generate is off for All drivers until it loads. Your other choices are kept.
                  </Notice>
                )
                : rosterEmpty ? <Notice tone="info" title="No drivers on the roster">There are no drivers to report on yet.</Notice>
                : type === "driver-breakdown" ? pickDriver(breakdownDriver, setBreakdownDriver)
                : type === "jobs-csv" ? (
                  <div className="space-y-2">
                    {allOrOne(csvAll, setCsvAll, "One driver")}
                    {!csvAll && pickDriver(csvDriver, setCsvDriver)}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {allOrOne(jobsAll, setJobsAll, "Choose drivers")}
                    {jobsAll && inactiveCodes.length > 0 && (
                      <label className="flex items-start gap-2 text-[13px] text-admin-ink-2">
                        <input type="checkbox" className="mt-0.5 accent-[var(--admin-brand,#7C3AED)]" checked={jobsInactive} onChange={event => guarded(setJobsInactive)(event.target.checked)} />
                        <span>Include inactive drivers ({inactiveCodes.length}). They may still have jobs in this period; leaving them out is faster and is stated in the report.</span>
                      </label>
                    )}
                    {!jobsAll && (
                      <DriverChecklist options={roster.options} selected={jobsPicked}
                        onToggle={(code, checked) => guarded((on: boolean) => setJobsPicked(current => on ? [...current, code] : current.filter(item => item !== code)))(checked)}
                        onSelectShown={codes => guarded(() => setJobsPicked(current => [...new Set([...current, ...codes])]))()}
                        onClear={() => guarded(() => setJobsPicked([]))()} />
                    )}
                  </div>
                )}
              {selection.problem && !roster.isLoading && !rosterFailed && !rosterEmpty && <p className="mt-1.5 text-[12.5px] text-admin-ink-2">{selection.problem}</p>}
            </Step>

            <Step n={3} title="Period (London time)" hint={type === "driver-jobs" ? "Weekly reports: pick This week or Last week." : undefined}>
              <PillGroup name="report-period" legend="Period" value={period} onChange={value => { guarded(setPeriod)(value); setRangeSource("user"); }}
                options={PERIODS.map(value => ({ value, label: PERIOD_LABELS[value] }))} />
              {period === "custom" && (
                <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  <label className="text-[12.5px] font-medium text-admin-ink-2">From
                    <input type="date" aria-label="From date" value={custom.from} max={custom.to || undefined} onChange={event => { guarded(setCustom)({ ...custom, from: event.target.value }); setRangeSource("user"); }} className={cx(controlBase, "mt-1 w-full")} />
                  </label>
                  <label className="text-[12.5px] font-medium text-admin-ink-2">To
                    <input type="date" aria-label="To date" value={custom.to} min={custom.from || undefined} onChange={event => { guarded(setCustom)({ ...custom, to: event.target.value }); setRangeSource("user"); }} className={cx(controlBase, "mt-1 w-full")} />
                  </label>
                </div>
              )}
              {!rangeError && "from" in range && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-admin-ink"><CalendarRange aria-hidden className="h-4 w-4 text-admin-ink-2" />{rangeLabel(range)}, London time</p>}
              {rangeSource === "overview" && <p className="mt-1 text-[12.5px] text-admin-ink-2">Taken from the Overview filters. Change it here if you need a different period.</p>}
              {rangeError && <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-admin-status-red"><AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{rangeError}</p>}
              {tooLong && (
                <p className="mt-1.5 text-[12.5px] text-admin-ink-2">
                  Your dates are kept as they are. <button type="button" disabled={busy} className="font-medium text-admin-brand underline underline-offset-2" onClick={() => { guarded(setCustom)({ from: latestAllowedStart(custom.to), to: custom.to }); setRangeSource("user"); }}>Use the last {MAX_REPORT_DAYS} days up to {custom.to}</button> or change either date.
                </p>
              )}
            </Step>

            <Step n={4} title="File format"
              hint={<>{effectiveFormat === "pdf" && type === "driver-jobs" ? "Download PDF saves a PDF file. Print report opens your browser's print dialog instead; the browser decides the file name there. " : ""}Google Sheets or Docs: open the Excel or Word file with File &gt; Import. This dashboard is not signed in to Google, so it cannot create the file there directly.</>}>
              <FormatTiles value={effectiveFormat} formats={spec.formats} type={type} onChange={value => setFormat(value)} />
            </Step>
          </fieldset>

          {/* ------------------------------------------------------------------- preview */}
          <div ref={paneRef} className="min-w-0 scroll-mt-2 lg:sticky lg:top-0">
            <section aria-label={ready ? "Report preview" : "Report status"} className="tmv-panel space-y-4 p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={EYEBROW}>Report preview</p>
                  <h3 ref={headingRef} tabIndex={-1} className="mt-0.5 text-[16px] font-semibold leading-6 text-admin-ink outline-none">{previewTitle}</h3>
                </div>
                {statusBadge}
              </header>

              {phase.kind === "idle" && (
                <div className="space-y-3">
                  {notice === "changed" && <Notice tone="info" title="Options changed">The earlier preview no longer matches the form, so it was cleared. Generate a new preview.</Notice>}
                  {notice === "cancelled" && <Notice tone="info" title="Generation cancelled">Nothing was produced. Your selections are kept.</Notice>}
                  <div className="flex items-start gap-3 rounded-xl border border-dashed border-admin-line bg-admin-surface/60 p-4">
                    <FileBarChart aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-admin-ink-2" />
                    <p className="text-[13.5px] leading-[20px] text-admin-ink-2">
                      {type === "driver-jobs" ? "Set up the report on the left, then select Generate Preview. You will see its totals and first jobs here before downloading anything."
                        : "This report is built by the server and downloads directly, so there is no preview. Select Download when the options on the left are right."}
                    </p>
                  </div>
                  {problems.length > 0 ? (
                    <div>
                      <p className="text-[12.5px] font-semibold text-admin-ink">Not ready yet</p>
                      <p className="mt-0.5 text-[12.5px] text-admin-ink-2">{problems.length === 1 ? "One option needs attention" : `${problems.length} options need attention`} on the left before you can continue.</p>
                    </div>
                  ) : (
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)]">
                      <dt className="text-admin-ink-2">Report</dt><dd className="font-medium text-admin-ink">{spec.label}</dd>
                      <dt className="text-admin-ink-2">Format</dt><dd className="font-medium text-admin-ink">{FORMAT_LABEL[effectiveFormat]}</dd>
                    </dl>
                  )}
                </div>
              )}

              {phase.kind === "loading" && (() => {
                const failedNow = Object.values(phase.states).filter(kind => kind === "failed").length;
                const codes = phase.resume ? (phase.resume.failed ?? []).map(item => item.initials) : [...phase.request.drivers];
                return (
                  <div className="space-y-3">
                    {recap(phase.request)}
                    <p role="status" className="text-[13.5px] text-admin-ink-2">
                      {phase.total > 1 || phase.resume ? `${phase.resume ? "Retrying failed drivers" : "Loading driver reports"} — ${phase.done} of ${phase.total} completed${failedNow ? `, ${failedNow} failed` : ""}` : "Loading the report…"}
                    </p>
                    <ProgressPanel heading="Report progress" done={phase.done} total={phase.total} drivers={codes.map(code => ({ code, name: nameOf(code), kind: phase.states[code] ?? "pending" }))} />
                  </div>
                );
              })()}

              {phase.kind === "error" && (
                <div className="space-y-3">
                  {recap(phase.request)}
                  <Notice tone="danger" title="Report not generated" action={type === "driver-jobs" ? <Action size="sm" onClick={prepare} disabled={!canGenerate}>Try again</Action> : undefined}>{phase.message}</Notice>
                </div>
              )}

              {phase.kind === "done" && (
                <div className="space-y-3">
                  {recap(phase.request)}
                  <Notice tone="success" title="Done">{phase.message}</Notice>
                </div>
              )}

              {exportError && <Notice tone="danger" title="File not created">{exportError}</Notice>}

              {ready && result && (
                <>
                  {recap(result.request)}
                  {phase.kind === "partial" && (
                    <Notice tone="warning" title="Report partially generated"
                      action={<span className="flex flex-wrap gap-2"><Action size="sm" onClick={retryFailed}>Retry failed drivers</Action><Action size="sm" variant="ghost" onClick={discardPartial}>Discard partial report</Action></span>}>
                      {ready.sections.length} of {(ready.requested?.length ?? ready.sections.length) - (ready.empty?.length ?? 0)} {ready.sections.length === 1 ? "driver" : "drivers"} loaded successfully. {ready.failed?.length} could not be loaded: {ready.failed?.map(item => `${item.initials}${item.attempts > 1 ? ` (tried ${item.attempts} times)` : ""}`).join(", ")}. Totals that need them are not available.
                    </Notice>
                  )}
                  {jobCount === 0 ? (
                    <div className="rounded-xl border border-dashed border-admin-line bg-admin-surface/60 p-4">
                      <p className="text-[14px] font-medium text-admin-ink">No jobs found for the selected period.</p>
                      <p className="mt-0.5 text-[12.5px] text-admin-ink-2">The report is complete: the drivers were checked and had no jobs between these dates. Change the drivers or the period on the left to look elsewhere.</p>
                    </div>
                  ) : (
                    <>
                      <MetricCards metrics={metrics} />
                      <PreviewTable rows={previewRows} total={jobCount} showDriver={ready.sections.length > 1} />
                    </>
                  )}
                  {[...(ready.notes ?? []).filter(note => jobCount > 0 || !note.startsWith("No jobs in this period")), ...(status?.status === "PARTIAL" ? status.reasons : []).filter(reason => !(ready.notes ?? []).some(note => note.includes(reason.slice(0, 20)))), ...ready.sections.flatMap(section => section.warnings.map(warning => ready.sections.length > 1 ? `${section.driver.initials}: ${warning}` : warning))].map(warning => (
                    <p key={warning} className="flex items-start gap-1.5 text-[12.5px] text-admin-ink-2"><AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-admin-status-amber" /><span>{warning}</span></p>
                  ))}
                  <p className="text-[12px] text-admin-ink-2">Generated {DateTime.fromISO(ready.generatedAt).setZone("Europe/London").toFormat("d LLL yyyy, HH:mm")} for the selections above. Change any option to prepare it again.</p>
                </>
              )}
            </section>
          </div>
        </div>
      </Modal>
      {printing && <PrintPortal><PaperDriverJobReport report={printing} /></PrintPortal>}
    </>
  );
}
