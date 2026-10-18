/** Timeline & evidence: eight milestones, durations, evidence completeness, photos, signature. */
import React, { useState } from "react";
import { Camera, CheckCircle2, CircleDashed, FileWarning, Hourglass, MapPin, PenLine, Smartphone, User } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { deleteEvidencePhoto } from "../../api";
import { formatLocationLabel, mapsUrlForLocation } from "../../../../../lib/geo";
import { ConfirmDialog } from "../../../../../ui/ConfirmDialog";
import { cx } from "../../../../../ui/cx";
import { formatDateTime, formatDelay, formatMinutes, formatShortDateTime } from "../../utils/format";
import { Badge, EmptyState, Missing, focusRing, type Tone } from "../ds";
import { JobScenarioSection } from "../JobScenarioSection";
import { PhotoModal, type PreviewPhoto } from "../PhotoModal";
import { Block } from "./parts";
import {
  EVIDENCE_STATE_LABEL, MILESTONE_STATE_LABEL, durationBars, evidenceRows, evidenceSummary, galleryPhotos, lifecycleOf, milestoneSummary, milestonesOf,
  type EvidenceRowState, type Milestone, type MilestoneKind, type MilestoneState
} from "./model";

const DELAY_SOURCE: Record<string, string> = {
  "gps-two-fresh-reports": "Tracker (two fresh GPS reports at pickup)", "proof-acceptance": "Proof photo acceptance time", unavailable: "Unavailable"
};
const KIND_ICON: Record<MilestoneKind, React.ReactNode> = {
  driver: <User aria-hidden className="h-3.5 w-3.5" />, tracker: <MapPin aria-hidden className="h-3.5 w-3.5" />,
  photo: <Camera aria-hidden className="h-3.5 w-3.5" />, customer: <PenLine aria-hidden className="h-3.5 w-3.5" />
};
const STATE_TONE: Record<MilestoneState, Tone> = { recorded: "success", pending: "neutral", missing: "danger", unverified: "warning" };
const EVIDENCE_TONE: Record<EvidenceRowState, Tone> = { recorded: "success", uploading: "info", failed: "danger", pending: "neutral", missing: "danger", notRequired: "neutral" };

function MilestoneRow({ milestone, onPhoto }: { milestone: Milestone; onPhoto?: () => void }) {
  const done = milestone.state === "recorded";
  return (
    <li className="group relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 pb-4 last:pb-0">
      <span aria-hidden className="absolute bottom-0 left-[13px] top-7 w-px bg-admin-line group-last:hidden" />
      <span aria-hidden className={cx("z-10 grid h-7 w-7 place-items-center rounded-full border",
        done ? "border-admin-status-green/40 bg-admin-status-green-bg text-admin-status-green" : milestone.state === "unverified" ? "border-admin-status-amber/40 bg-admin-status-amber-bg text-admin-status-amber"
          : milestone.state === "missing" ? "border-admin-status-red/40 bg-admin-status-red-bg text-admin-status-red" : "border-admin-line bg-admin-surface text-admin-muted")}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : milestone.state === "pending" ? <Hourglass className="h-3.5 w-3.5" /> : milestone.state === "unverified" ? <FileWarning className="h-3.5 w-3.5" /> : <CircleDashed className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-admin-ink">{milestone.label}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-admin-ink-2">{KIND_ICON[milestone.kind]}{milestone.source}
          {onPhoto && done && <><span aria-hidden>·</span><button type="button" onClick={onPhoto} className={cx("font-semibold text-admin-brand hover:underline", focusRing)}>View photo</button></>}</p>
        {milestone.note && <p className={cx("mt-0.5 break-words text-[12.5px]", milestone.state === "unverified" ? "text-admin-status-amber" : milestone.state === "recorded" && milestone.key === "proof" && milestone.note.includes("after") ? "text-admin-status-red" : "text-admin-ink-2")}>
          {milestone.state === "unverified" ? `Unverified: ${milestone.note}` : milestone.note}</p>}
      </div>
      <div className="text-right">
        {done
          ? <p className="text-[14px] font-medium tabular-nums text-admin-ink">{formatShortDateTime(milestone.at!)}</p>
          : <Badge tone={STATE_TONE[milestone.state]}>{MILESTONE_STATE_LABEL[milestone.state]}</Badge>}
      </div>
    </li>
  );
}

function DurationBars({ job }: { job: NormalizedJob }) {
  const bars = durationBars(job);
  if (!bars.length) return <p className="text-[13.5px] text-admin-ink-2">No durations recorded yet.</p>;
  const longest = Math.max(...bars.map(bar => bar.minutes));
  return (
    <ul className="space-y-2.5">
      {bars.map(bar => (
        <li key={bar.key}>
          <div className="flex items-baseline justify-between gap-2 text-[13.5px]"><span className="font-medium text-admin-ink">{bar.label}</span><span className="tabular-nums text-admin-ink">{formatMinutes(bar.minutes)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-admin-surface" role="img" aria-label={`${bar.label}: ${formatMinutes(bar.minutes)}`}>
            <div className={cx("h-2 rounded-full", bar.key === "reported" ? "bg-admin-status-amber" : "bg-admin-brand")} style={{ width: `${Math.max(3, Math.round(bar.minutes / longest * 100))}%` }} />
          </div>
          <p className="mt-0.5 text-[12px] text-admin-ink-2">{bar.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function TimelineTab({ job, onUpdated, onToast }: { job: NormalizedJob; onUpdated: (job: NormalizedJob) => void; onToast: (message: string) => void }) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PreviewPhoto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const milestones = milestonesOf(job);
  const summary = milestoneSummary(milestones, job);
  const rows = evidenceRows(job);
  const evidence = evidenceSummary(job);
  const lifecycle = lifecycleOf(job);
  const delayKnown = job.arrivalDelaySource && job.arrivalDelaySource !== "unavailable" && Number.isFinite(job.delayMinutes);
  const all = galleryPhotos(job);
  const categories = Array.from(new Set(all.map(photo => photo.category)));
  const shown = filter === "all" ? all : all.filter(photo => photo.category === filter);
  const photos: PreviewPhoto[] = shown.map(photo => ({
    id: photo.id, title: `${photo.categoryLabel} photo`, url: photo.url, driveUrl: photo.driveUrl,
    caption: <>{photo.capturedAt ? `Taken ${formatDateTime(photo.capturedAt)}` : photo.receivedAt ? `Received ${formatDateTime(photo.receivedAt)}` : "Capture time not recorded"}{" · "}
      {photo.location ? <a className="text-admin-brand underline" target="_blank" rel="noreferrer" href={mapsUrlForLocation(photo.location)}>{formatLocationLabel(photo.location, photo.locationName)}</a> : "Location not recorded"}</>
  }));
  const openPhotoFor = (category?: string) => { const index = all.findIndex(photo => photo.category === category); if (index < 0) return; setFilter("all"); setPhotoIndex(index); };
  const notes: string[] = [];
  const pickup = milestones.find(item => item.key === "pickup");
  if (pickup?.state === "unverified") notes.push(`Tracker arrival unverified${pickup.note ? `: ${pickup.note}` : ""}. Punctuality is not scored from a tracker time.`);
  if (job.arrivalProofLate) notes.push(`Proof of arrival photo was taken ${job.arrivalProofDelayMinutes ?? "?"} min after the tracker arrival.`);
  if (job.arrivalProofOverdue) notes.push("Proof of arrival photo is overdue.");

  const deletable = (photo: PreviewPhoto) => {
    const item = job.evidenceItems.find(entry => entry.id === photo.id);
    return !!item && item.category !== "Signature" && item.category !== "Documents";
  };
  const doDelete = async (photo: PreviewPhoto) => {
    setDeletingId(photo.id);
    try {
      await deleteEvidencePhoto(job.jobId, photo.id);
      onUpdated({ ...job, evidenceItems: job.evidenceItems.filter(item => item.id !== photo.id) });
      setPhotoIndex(null);
      onToast("Photo deleted");
    } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
      <div className="space-y-4">
      <Block title="Timeline" id="job-timeline" aside={<span className="font-semibold tabular-nums text-admin-ink">{summary.text}</span>}
        description="Each step shows who or what recorded it. Booking times are planned; tracker and photo times are observed.">
        <ol aria-label="Job milestones">
          {milestones.map(item => <MilestoneRow key={item.key} milestone={item} onPhoto={item.category && item.category !== "Signature" ? () => openPhotoFor(item.category) : undefined} />)}
        </ol>
        <div className="mt-3 rounded-lg bg-admin-surface px-3 py-2 text-[13.5px]">
          <span className="font-medium">Arrival vs schedule: </span>
          {delayKnown ? <>{formatDelay(job.delayMinutes)} <span className="text-admin-ink-2">· basis: {DELAY_SOURCE[job.arrivalDelaySource!]}</span></>
            : lifecycle === "scheduled" ? <span className="text-admin-ink-2">Not yet. The job has not started.</span>
            : <span className="text-admin-status-amber">Unverified. No trustworthy arrival time, so punctuality is not scored.</span>}
        </div>
        {notes.length > 0 && (
          <ul aria-label="Data quality notes" className="mt-2 space-y-1">
            {notes.map(note => <li key={note} className="flex items-start gap-2 text-[13px] text-admin-status-amber"><Smartphone aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</li>)}
          </ul>
        )}
      </Block>

      <Block title="Booked, billed and actual time" description="Four different measures. They are shown side by side, never added together.">
        <DurationBars job={job} />
      </Block>
      </div>

      <div className="space-y-4">
      <Block title="Evidence completeness" aside={rows.length ? <span className="tabular-nums">{evidence.recorded} of {evidence.total} recorded</span> : undefined}
        description={lifecycle === "completed" && evidence.missing.length ? "This job is completed but some required evidence is missing." : undefined}>
        {rows.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map(row => (
              <li key={row.label} className="flex items-center justify-between gap-2 rounded-lg border border-admin-line px-3 py-2 text-[14px]">
                <span>{row.label}</span><Badge tone={EVIDENCE_TONE[row.state]}>{EVIDENCE_STATE_LABEL[row.state]}</Badge>
              </li>
            ))}
          </ul>
        ) : <Missing>Evidence status not recorded</Missing>}
      </Block>

      <Block title={`Photos (${all.length})`}
        aside={categories.length > 1 ? (
          <label className="inline-flex items-center gap-2 text-[12.5px]">Show
            <select value={filter} onChange={event => setFilter(event.target.value)} className="h-8 rounded-lg border border-admin-line bg-surface px-2 text-[13px] text-admin-ink">
              <option value="all">All photos</option>
              {categories.map(category => <option key={category} value={category}>{all.find(photo => photo.category === category)!.categoryLabel}</option>)}
            </select>
          </label>
        ) : undefined}>
        {shown.length ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {shown.map((photo, index) => (
              <li key={photo.id}>
                <button type="button" onClick={() => setPhotoIndex(index)} aria-label={`Preview ${photo.categoryLabel} photo${photo.capturedAt ? `, taken ${formatShortDateTime(photo.capturedAt)}` : ""}`}
                  className={cx("group block w-full overflow-hidden rounded-xl border border-admin-line bg-admin-surface text-left", focusRing)}>
                  <img src={photo.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90" />
                  <span className="block px-2 py-1.5">
                    <span className="block truncate text-[13px] font-semibold text-admin-ink">{photo.categoryLabel}</span>
                    <span className="block truncate text-[12px] tabular-nums text-admin-ink-2">{photo.capturedAt || photo.receivedAt ? formatShortDateTime(photo.capturedAt || photo.receivedAt!) : "Time not recorded"}</span>
                    <span className="block truncate text-[12px] text-admin-ink-2">{photo.location ? formatLocationLabel(photo.location, photo.locationName) : "Location not recorded"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="No photos received" message={lifecycle === "completed" ? "This completed job has no uploaded photos." : lifecycle === "cancelled" ? "No photos were taken before cancellation." : "Photos appear here as the driver uploads them."} />}
      </Block>

      <Block title="Customer signature">
        {job.signatureUrl ? (
          <div className="flex flex-wrap items-end gap-4">
            <img src={job.signatureUrl} alt="Customer signature" className="h-24 rounded-lg border border-admin-line bg-white p-2" />
            <p className="text-[13.5px] text-admin-ink-2">{job.clientConfirmedName ? <>Signed as <strong className="text-admin-ink">{job.clientConfirmedName}</strong><br /></> : null}{job.clientSignatureAt ? formatDateTime(job.clientSignatureAt) : "Signature time not recorded"}</p>
          </div>
        ) : <p className="text-[13.5px] text-admin-ink-2">{lifecycle === "completed" ? "No signature was recorded for this job." : lifecycle === "cancelled" ? "Not required." : "Not yet. The customer signs when the job is finished."}</p>}
      </Block>
      </div>
      </div>

      {job.scenarios?.length > 0 && <Block title="Evidence & liability submissions"><JobScenarioSection scenarios={job.scenarios} /></Block>}

      <PhotoModal isOpen={photoIndex !== null} onClose={() => setPhotoIndex(null)} photos={photos} index={photoIndex ?? 0} onIndex={setPhotoIndex}
        deletingId={deletingId} onDelete={photoIndex !== null && photos[photoIndex] && deletable(photos[photoIndex]) ? photo => setConfirmDelete(photo) : undefined} />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete ? doDelete(confirmDelete) : undefined}
        title="Delete this photo?" body="The photo is removed from this job's evidence permanently. This cannot be undone." confirmLabel="Delete photo" tone="danger" />
    </div>
  );
}
