/** Ported from TMV-Chat-bot's dashboard/web/src/components/StatusBadge.tsx. */
import React from "react";
import { CheckCircle2, Clock, Calendar, XCircle, AlertTriangle } from "lucide-react";
import { DelayBand, JobStatus, NormalizedJob } from "../types";
import { DateTime } from "luxon";

export function JobRescheduleWarning({ notice: rescheduleNotice }: { notice?: NormalizedJob["rescheduleNotice"] }) {
  if (!rescheduleNotice) return null;
  const admin = rescheduleNotice.kind === "admin-completed";
  const scheduled = DateTime.fromISO(rescheduleNotice.scheduledStart).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm");
  return <span className={`mt-3 flex w-full min-w-0 items-start gap-1.5 rounded-control border px-2 py-1.5 text-left text-[12px] font-medium whitespace-normal ${admin ? "bg-admin-status-amber-bg text-admin-status-amber border-admin-status-amber/20" : "bg-admin-status-red-bg text-admin-status-red border-admin-status-red/20"}`}
      title={`Calendar schedule: ${scheduled}; driver: ${rescheduleNotice.driverInitials || "Unassigned"}`}>
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{admin ? "Admin completed job reassigned" : "Completed job reassigned"}</span>
  </span>;
}

export function JobStatusBadge({ status, activity = [] }: { status: JobStatus | string; activity?: ReadonlyArray<{ action: string }> }) {
  switch (status) {
    case "READY":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-surface text-admin-ink-2 border border-admin-line">
          <Calendar className="w-3 h-3 text-admin-muted" />
          Scheduled
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-brand-soft text-admin-brand border border-admin-brand/20">
          <Clock className="w-3 h-3 animate-pulse" />
          In Progress
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-green-bg text-admin-status-green border border-admin-status-green/20">
          <CheckCircle2 className="w-3 h-3" />
          {activity.some(entry => entry.action === "ADMIN_MARKED_COMPLETED") ? "Admin Completed" : "Completed"}
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-red-bg text-admin-status-red border border-admin-status-red/20">
          <XCircle className="w-3 h-3" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-surface text-admin-ink-2 border border-admin-line">
          {status}
        </span>
      );
  }
}

export function DelayBandBadge({ band, minutes }: { band: DelayBand; minutes: number }) {
  if (minutes === 0 || band === "ON_TIME") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-green-bg text-admin-status-green border border-admin-status-green/20">
        <CheckCircle2 className="w-3 h-3" /> On time
      </span>
    );
  }
  if (minutes < 0 || band === "EARLY") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-brand-soft text-admin-brand border border-admin-brand/20">
        <Clock className="w-3 h-3" /> {Math.abs(minutes)}m early
      </span>
    );
  }
  if (band === "LATE_5_15") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-amber-bg text-admin-status-amber border border-admin-status-amber/20">
        <AlertTriangle className="w-3 h-3" /> +{minutes}m delay
      </span>
    );
  }
  if (band === "LATE_15_30") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-red-bg text-admin-status-red border border-admin-status-red/20">
        <AlertTriangle className="w-3 h-3" /> +{minutes}m delay
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[12px] font-medium bg-admin-status-red-bg text-admin-status-red border border-admin-status-red/30">
      <AlertTriangle className="w-3 h-3" /> +{minutes}m severe delay
    </span>
  );
}
