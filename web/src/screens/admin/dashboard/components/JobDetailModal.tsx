/**
 * The one job detail (audit p.8). Opened from Jobs, Overview, driver reports, Alerts,
 * Live Fleet and search via the `job` URL param (navigation.openJob), always over the
 * page the user came from, so closing it returns them exactly where they were.
 *
 * Replaces the former "Operations Dossier" drawer (active jobs) and the separate
 * Finished Jobs submission drawer, which showed the same job two different ways.
 *
 * Structure: identity + independent status badges, then one scrolling page starting
 * with the original booking, timeline/evidence, charges/payment and activity. Frequent actions
 * (Download PDF) sit apart from consequential ones (Reassign, Mark as finished).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, UserX, Copy, Download, Eye, MoreHorizontal, Save, UserPlus, CheckCircle2 } from "lucide-react";
import { fetchJobDetail, deleteEvidencePhoto, markJobFinishedManually, reassignJob } from "../api";
import { fetchDrivers as fetchDriverRoster } from "../../../../api/admin";
import type { NormalizedJob } from "../types";
import { closeJob, urlParam } from "../navigation";
import { reportReturnHref } from "../utils/reportNavigation";
import { htmlToPlainText } from "../../../../lib/htmlText";
import { formatLocationLabel, mapsUrlForLocation } from "../../../../lib/geo";
import { RawBookingText } from "../../../../components/driver/RawBookingText";
import { Menu } from "../../../../ui/Menu";
import { Modal } from "../../../../ui/Modal";
import { ConfirmDialog } from "../../../../ui/ConfirmDialog";
import { Action, Badge, Dialog, EmptyState, ErrorState, Facts, LoadingState, Missing, Notice, controlBase, type FactRow, type Tone } from "./ds";
import { DriverViewedBadge, JobStatusBadge, ReviewBadge, evidenceState, paymentState } from "./StatusBadge";
import { JobTimeBreakdown } from "./JobTimeBreakdown";
import { JobScenarioSection } from "./JobScenarioSection";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { PaperDossierReport } from "./PaperDossierReport";
import { useRosterDriver } from "./jobdetail/parts";
import { PhotoModal, type PreviewPhoto } from "./PhotoModal";
import { waitForPrintImages } from "../utils/printReady";
import { formatDateTime, formatMoney, formatShortDateTime, formatTime, formatDelay, formatMinutes } from "../utils/format";
import { hasInvoice, isUnassigned } from "../hooks/useAttention";
import { cx } from "../../../../ui/cx";
import { JobBadges } from "./jobdetail/JobSummary";
import { DetailsTab } from "./jobdetail/DetailsTab";
import { TimelineTab } from "./jobdetail/TimelineTab";
import { ChargesTab } from "./jobdetail/ChargesTab";
import { ActivityTab } from "./jobdetail/ActivityTab";
import { lifecycleOf } from "./jobdetail/model";

/** Mounted once by AdminApp: shows the full-width job page whenever the URL has `job`. */
export function JobDetailRoute() {
  const [jobId, setJobId] = useState(() => urlParam("job"));
  useEffect(() => {
    const read = () => setJobId(urlParam("job"));
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!jobId) return null;
  return <JobDetailModal key={jobId} jobId={jobId} onClose={closeJob} />;
}

export function JobDetailModal({ jobId, onClose, initialJob }: { jobId: string; onClose: () => void; initialJob?: NormalizedJob }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["job_detail", jobId], queryFn: () => fetchJobDetail(jobId), initialData: initialJob, retry: 1 });
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const job = query.data;
  const backToReport = reportReturnHref();
  const stage = job ? lifecycleOf(job) : "active";
  const van = useRosterDriver({ driverInitials: job?.driverInitials ?? "" });

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["today_jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["driver_report"] });
  };
  const replaceJob = (next: NormalizedJob) => { queryClient.setQueryData(["job_detail", jobId], next); refreshLists(); };
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3500); };

  const subtitle = job ? (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium text-admin-ink">{job.jobId}</span>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(job.jobId); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
        aria-label="Copy job ID" className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-admin-ink-2 hover:bg-admin-surface">
        {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-admin-status-green" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy ID"}
      </button>
      <span aria-hidden className="hidden sm:inline">·</span><span>{formatShortDateTime(job.bookedStart, "Not scheduled")}{job.bookedFinish ? `–${formatTime(job.bookedFinish)}` : ""}</span>
      <span aria-hidden className="hidden sm:inline">·</span><span>{job.driverName && job.driverName !== "Unassigned" ? job.driverName : "No driver assigned"}</span>
    </span>
  ) : jobId;

  const handlePrint = () => {
    document.body.classList.add("printing-report");
    window.setTimeout(async () => {
      await waitForPrintImages("#tmv-print-portal, .print-content");
      window.print();
      document.body.classList.remove("printing-report");
    }, 300);
  };

  return (
    <>
      <Dialog open fullScreen onClose={onClose} title={job ? job.customerName || "Customer not recorded" : "Job details"} subtitle={subtitle}
        headerActions={job ? <>
          <Action icon={<Eye />} onClick={() => setPdfOpen(true)}>Preview PDF</Action>
          <Action variant="primary" icon={<Download />} onClick={() => { setPdfOpen(true); handlePrint(); }}>Download PDF</Action>
        </> : undefined}
        headerExtra={job ? (
          <div className="space-y-2.5 pt-2 md:py-3">
            {backToReport && (
              <button type="button" onClick={() => { window.history.replaceState({}, "", backToReport); window.dispatchEvent(new PopStateEvent("popstate")); }}
                className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-admin-brand hover:underline"><ArrowLeft aria-hidden className="h-4 w-4" />Back to driver report</button>
            )}
            <JobBadges job={job} />
          </div>
        ) : undefined}
        footer={job ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] text-admin-ink-2">{job.jobId}</span>
            <div className="flex items-center gap-2">
              {stage === "completed" || stage === "cancelled"
                ? <span className="hidden text-[12.5px] text-admin-ink-2 sm:inline">{stage === "completed" ? "Completed jobs keep their recorded driver" : "Cancelled job"}</span>
                : <Action variant="primary" icon={<UserPlus />} onClick={() => setReassignOpen(true)}>{isUnassigned(job) ? "Assign driver" : "Reassign driver"}</Action>}
              <Menu align="end" trigger={props => <Action {...props} aria-label="More job actions" icon={<MoreHorizontal />}>More</Action>}
                items={[{ id: "finish", label: "Mark as finished…", icon: <CheckCircle2 />, onSelect: () => setFinishOpen(true), disabled: stage === "completed" || stage === "cancelled" }]} />
            </div>
          </div>
        ) : undefined}>
        {toast && <div className="mb-3"><Notice tone="success">{toast}</Notice></div>}
        {!job && query.isLoading && <LoadingState label="Loading job" rows={6} />}
        {!job && query.isError && <ErrorState title={`Couldn't load job ${jobId}`} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />}
        {job && (
          <div className="space-y-6">
            <section aria-label="Job details"><DetailsTab job={job} /></section>
            <section aria-label="Timeline and evidence"><TimelineTab job={job} onUpdated={replaceJob} onToast={flash} /></section>
            <section aria-label="Charges and payment"><ChargesTab job={job} /></section>
            <section aria-label="Job activity"><ActivityTab job={job} /></section>
          </div>
        )}
      </Dialog>
      {job && reassignOpen && <ReassignDialog job={job} onClose={() => setReassignOpen(false)} onDone={next => { setReassignOpen(false); replaceJob({ ...job, ...next }); flash(`Reassigned to ${next.driverName}`); }} />}
      {job && finishOpen && <ManualFinishDialog job={job} onClose={() => setFinishOpen(false)} onDone={next => { setFinishOpen(false); replaceJob(next); flash("Job marked as finished"); }} />}
      {job && <PdfPreviewModal fileName={`${job.jobId}_Job_Report.pdf`} renderReport={isPreview => <PaperDossierReport job={job} isPreview={isPreview} vehicle={van?.vanRegistration || undefined} />} isOpen={pdfOpen} onClose={() => setPdfOpen(false)} onDownload={handlePrint} />}
    </>
  );
}

/* ----------------------------------------------------------------- dialogs --- */

function ReassignDialog({ job, onClose, onDone }: { job: NormalizedJob; onClose: () => void; onDone: (next: { driverInitials: string; driverName: string }) => void }) {
  const roster = useQuery({ queryKey: ["admin_driver_options"], queryFn: fetchDriverRoster, staleTime: 60 * 60 * 1000 });
  const [initials, setInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drivers = (roster.data ?? []).filter(driver => driver.active && driver.initials !== job.driverInitials);
  const confirm = async () => {
    if (!initials) { setError("Choose a driver."); return; }
    setBusy(true); setError("");
    try { const result = await reassignJob(job.jobId, initials); onDone(result); }
    catch (err) { setError((err as Error)?.message || "Couldn't reassign this job."); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Reassign ${job.jobId}`} placement="center" dismissible={!busy}
      footer={<div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={busy}>Cancel</Action><Action variant="primary" loading={busy} onClick={() => void confirm()}>Reassign and notify driver</Action></div>}>
      <p className="text-[14px] text-admin-ink-2">The new driver is notified and the linked Calendar event is updated. Currently: <strong className="text-admin-ink">{job.driverName || "No driver"}</strong>.</p>
      <label className="mt-4 block text-[13px] font-medium text-admin-ink-2">New driver
        <select value={initials} onChange={event => { setInitials(event.target.value); setError(""); }} disabled={roster.isLoading || busy} aria-invalid={!!error || undefined} className={`${controlBase} mt-1 w-full`}>
          <option value="">{roster.isLoading ? "Loading drivers…" : roster.isError ? "Driver list unavailable" : "Choose a driver"}</option>
          {drivers.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName} ({driver.initials})</option>)}
        </select>
      </label>
      {error && <p role="alert" className="mt-2 text-[13px] text-admin-status-red">{error}</p>}
    </Modal>
  );
}

function ManualFinishDialog({ job, onClose, onDone }: { job: NormalizedJob; onClose: () => void; onDone: (job: NormalizedJob) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = evidenceState(job).missing;
  const confirm = async () => {
    if (!note.trim()) { setError("A reason is required."); return; }
    setBusy(true); setError("");
    try { const result = await markJobFinishedManually(job.jobId, note.trim()); onDone(result.job); }
    catch (err) { setError((err as Error)?.message || "Couldn't mark this job as finished. Your reason is kept."); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Mark as finished" placement="center" dismissible={!busy}
      footer={<div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={busy}>Cancel</Action><Action variant="primary" loading={busy} onClick={() => void confirm()}>Mark as finished</Action></div>}>
      <p className="text-[14px] text-admin-ink-2">{job.jobId} · {job.customerName || "Customer not recorded"}</p>
      <Notice tone="warning" title="What this does">
        The job is completed for scheduling and the driver flow. Missing evidence stays missing{missing.length ? ` (${missing.join(", ")})` : ""}, and no payment is recorded.
      </Notice>
      <label className="mt-4 block text-[13px] font-medium text-admin-ink-2">Reason <span className="text-admin-status-red">(required)</span>
        <textarea value={note} maxLength={1000} rows={4} onChange={event => { setNote(event.target.value); setError(""); }} aria-invalid={!!error || undefined}
          placeholder="For example: driver completed the job outside the app"
          className="mt-1 w-full rounded-lg border border-admin-line px-3 py-2 text-[14px] text-admin-ink outline-none focus:border-admin-brand focus:ring-2 focus:ring-admin-brand/20" />
        <span className="mt-1 block text-right text-[12px]">{note.trim().length}/1000</span>
      </label>
      {error && <p role="alert" className="text-[13px] text-admin-status-red">{error}</p>}
    </Modal>
  );
}
