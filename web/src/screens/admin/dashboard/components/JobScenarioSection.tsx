import React, { useState } from "react";
import { Camera, Check, Clock3, LogIn, LogOut, AlertCircle, ShieldAlert, User, PenLine } from "lucide-react";
import type { JobScenarioSubmission, ScenarioKind } from "../types";
import { formatLondonDateTime } from "../utils/date";
import { formatLocationLabel, mapsUrlForLocation, type CapturedLocation } from "../../../../lib/geo";
import { scenarioPointFromRecord } from "../utils/scenarioPoint";
import { Badge, focusRing } from "./ds";
import { Block } from "./jobdetail/parts";
import { PhotoModal, type PreviewPhoto } from "./PhotoModal";

const KIND_META: Record<ScenarioKind, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  checkin: { label: "Check In", icon: LogIn, color: "bg-admin-status-green-bg text-admin-status-green" },
  checkout: { label: "Check Out", icon: LogOut, color: "bg-admin-brand-soft text-admin-brand" },
  parking: { label: "Parking Liability", icon: AlertCircle, color: "bg-admin-status-amber-bg text-admin-status-amber" },
  liability: { label: "Liability Report", icon: ShieldAlert, color: "bg-admin-status-red-bg text-admin-status-red" }
};

function Field({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[12px] font-medium text-admin-ink-2">{label}</dt>
      <dd className="mt-1 break-words text-[13.5px] font-medium text-admin-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function EvidenceMeta({ capturedAt, location, locationName }: { capturedAt?: string; location?: CapturedLocation; locationName?: string }) {
  if (!capturedAt && !location) return null;
  return (
    <div className="mt-1.5 space-y-0.5 text-[12px] leading-relaxed text-admin-ink-2">
      {capturedAt && <div className="tabular-nums">{formatLondonDateTime(capturedAt)}</div>}
      {location ? (
        <a href={mapsUrlForLocation(location)} target="_blank" rel="noopener noreferrer"
          className={`block break-words text-admin-brand hover:underline [overflow-wrap:anywhere] ${focusRing}`}>
          {formatLocationLabel(location, locationName)}
        </a>
      ) : <div>Location not recorded</div>}
    </div>
  );
}

function ScenarioCard({ item }: { item: JobScenarioSubmission }) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const point = scenarioPointFromRecord(item);
  const photos: PreviewPhoto[] = item.photos.map((photo, index) => ({
    id: `${item.id}:photo:${index}`, title: `${meta.label} photo ${index + 1}`, url: photo.thumbUrl,
    caption: <EvidenceMeta {...photo} />
  }));
  if (item.signature) photos.push({ id: `${item.id}:signature`, title: `${meta.label} signature`, url: item.signature.thumbUrl, caption: <EvidenceMeta {...item.signature} /> });

  return (
    <article aria-label={`${meta.label} submission`} className="min-w-0 overflow-hidden rounded-xl border border-admin-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-admin-line bg-admin-surface/50 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.color}`}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[14px] font-semibold text-admin-ink">{meta.label}</h4>
              {point && <Badge tone="info">{point.point}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-admin-ink-2">
              <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden className="h-3.5 w-3.5" />{formatLondonDateTime(item.timestamp)}</span>
              {item.driver && <span className="inline-flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]"><User aria-hidden className="h-3.5 w-3.5 shrink-0" />{item.driver}</span>}
            </div>
          </div>
        </div>
        <Badge tone={item.signature ? "success" : "neutral"}>{item.signature ? <><Check aria-hidden className="mr-1 h-3 w-3" />Signed</> : "Signature not recorded"}</Badge>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
        {(item.kind === "checkin" || item.kind === "checkout") && <Field label="Container Number" value={item.containerNumber} />}
        {item.kind === "parking" && <Field label="Address" value={item.address} wide />}
        {item.kind === "liability" && <Field label="Damage Categories" value={item.damageCategories} wide />}
        <Field label="Client Name" value={item.clientName} />
        <Field label="Client Phone" value={item.clientPhone} />
        <Field label="Client Email" value={item.clientEmail} />
        <Field label="Client Present" value={item.clientPresent} />
        {point && <Field label="Reported At" value={point.full} wide />}
      </dl>

      <div className="border-t border-admin-line p-4">
        <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-admin-ink"><Camera aria-hidden className="h-4 w-4 text-admin-ink-2" />Evidence photos <span className="font-normal text-admin-ink-2">({item.photos.length})</span></p>
        {item.photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {item.photos.map((photo, index) => (
              <li key={`${photo.fileId}-${index}`} className="min-w-0">
                <button type="button" onClick={() => setPhotoIndex(index)} aria-label={`Preview ${meta.label} photo ${index + 1}`}
                  className={`group block w-full overflow-hidden rounded-lg border border-admin-line bg-admin-surface text-left ${focusRing}`}>
                  <img src={photo.thumbUrl} alt={`${meta.label} evidence ${index + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90" />
                  <span className="block px-2 py-1.5 text-[12px] font-medium text-admin-ink-2">Photo {index + 1} · View</span>
                </button>
                <EvidenceMeta {...photo} />
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-admin-ink-2">No photos recorded with this submission.</p>}
      </div>

      {item.signature && (
        <div className="border-t border-admin-line p-4">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-admin-ink"><PenLine aria-hidden className="h-4 w-4 text-admin-ink-2" />Client signature</p>
          <button type="button" onClick={() => setPhotoIndex(item.photos.length)} aria-label={`Preview ${meta.label} signature`}
            className={`block w-full rounded-lg border border-admin-line bg-white p-3 sm:max-w-[280px] ${focusRing}`}>
            <img src={item.signature.thumbUrl} alt="Client signature" loading="lazy" className="h-16 w-full object-contain" />
          </button>
          <EvidenceMeta {...item.signature} />
        </div>
      )}
      <PhotoModal isOpen={photoIndex !== null} onClose={() => setPhotoIndex(null)} photos={photos} index={photoIndex ?? 0} onIndex={setPhotoIndex} />
    </article>
  );
}

/** Job-linked submissions use the same record blocks as the surrounding evidence. */
export function JobScenarioSection({ scenarios }: { scenarios: JobScenarioSubmission[] | undefined }) {
  if (!scenarios?.length) return null;
  return (
    <Block title="Evidence & liability submissions" aside={<Badge>{scenarios.length} {scenarios.length === 1 ? "submission" : "submissions"}</Badge>}>
      <div className={`grid items-start gap-4 ${scenarios.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {scenarios.map(item => <ScenarioCard key={item.id} item={item} />)}
      </div>
    </Block>
  );
}
