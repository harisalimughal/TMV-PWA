import React from "react";
import { LogIn, LogOut, AlertCircle, ShieldAlert } from "lucide-react";
import { JobScenarioSubmission, ScenarioKind } from "../types";
import { formatLondonDateTime } from "../utils/date";
import { formatLocationLabel, mapsUrlForLocation, type CapturedLocation } from "../../../../lib/geo";

const KIND_META: Record<ScenarioKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  checkin: { label: "Check In", icon: LogIn },
  checkout: { label: "Check Out", icon: LogOut },
  parking: { label: "Parking Liability", icon: AlertCircle },
  liability: { label: "Liability Report", icon: ShieldAlert }
};

function Field({ label, value, span2 = false }: { label: string; value: string; span2?: boolean }) {
  if (!value) return null;
  return (
    <div className={span2 ? "col-span-2" : undefined}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-admin-muted">{label}</span>
      <span className="mt-0.5 block text-[13px] font-medium text-admin-ink break-words">{value}</span>
    </div>
  );
}

function EvidenceMeta({
  capturedAt,
  location,
  locationName,
  center = false
}: {
  capturedAt?: string;
  location?: CapturedLocation;
  locationName?: string;
  center?: boolean;
}) {
  if (!capturedAt && !location) return null;
  return (
    <div className={`mt-1 text-[10px] leading-tight text-admin-muted space-y-0.5 ${center ? "text-center" : ""}`}>
      {capturedAt && <div>{formatLondonDateTime(capturedAt)}</div>}
      {location ? (
        <a
          href={mapsUrlForLocation(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[160px] truncate text-admin-brand underline underline-offset-2"
        >
          {formatLocationLabel(location, locationName)}
        </a>
      ) : (
        <div>No location</div>
      )}
    </div>
  );
}

function ScenarioCard({ item }: { item: JobScenarioSubmission }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <div className="rounded-card border border-admin-line bg-admin-surface/40 p-3">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-admin-ink">
          <Icon className="w-3.5 h-3.5 text-admin-brand" /> {meta.label}
        </span>
        <span className="text-[11px] text-admin-muted">
          {formatLondonDateTime(item.timestamp)} &bull; {item.driver}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {(item.kind === "checkin" || item.kind === "checkout") && (
          <Field label="Container Number" value={item.containerNumber} />
        )}
        {item.kind === "parking" && <Field label="Address" value={item.address} span2 />}
        {item.kind === "liability" && <Field label="Damage Categories" value={item.damageCategories} span2 />}
        <Field label="Client Name" value={item.clientName} />
        <Field label="Client Phone" value={item.clientPhone} />
        <Field label="Client Present" value={item.clientPresent} />
      </div>

      {item.photos.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {item.photos.map((p, i) => (
            <div key={i} className="w-24 shrink-0">
              <a
                href={p.thumbUrl}
                target="_blank"
                rel="noreferrer"
                className="w-14 h-14 rounded-card overflow-hidden border border-admin-line block bg-white hover:border-admin-brand transition"
              >
                <img src={p.thumbUrl} className="w-full h-full object-cover" alt="Scenario evidence" />
              </a>
              <EvidenceMeta capturedAt={p.capturedAt} location={p.location} locationName={p.locationName} />
            </div>
          ))}
        </div>
      )}

      {item.signature && (
        <div className="mt-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-admin-muted mb-1">Signature</span>
          <div className="inline-block bg-white border border-admin-line rounded-card p-2">
            <img src={item.signature.thumbUrl} className="h-10 object-contain mix-blend-multiply" alt="Client signature" />
          </div>
          <EvidenceMeta
            capturedAt={item.signature.capturedAt}
            location={item.signature.location}
            locationName={item.signature.locationName}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Check In/Check Out/Parking Liability/Liability Report submissions filed against
 * one specific job -- these used to only be reachable from their own standalone
 * Scenarios tabs (scenarioSubmissions are jobId-scoped in Mongo, but nothing joined
 * them back onto the job they belong to). Renders nothing for the common case of a
 * job with none, same pattern as the Booking Description card.
 */
export function JobScenarioSection({ scenarios }: { scenarios: JobScenarioSubmission[] | undefined }) {
  if (!scenarios?.length) return null;
  return (
    <div className="bg-white p-5 rounded-module border border-admin-line shadow-[0_2px_10px_rgb(0,0,0,0.02)] space-y-3">
      <h4 className="text-[12px] font-bold text-admin-muted uppercase tracking-wider">
        Check In / Check Out / Liability
      </h4>
      <div className="space-y-2.5">
        {scenarios.map(item => (
          <ScenarioCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
