/** Ported from TMV-Chat-bot's dashboard/web/src/components/StatusBadge.tsx. */
import React from "react";
import { CheckCircle2, Clock, Calendar, XCircle, AlertTriangle } from "lucide-react";
import { DelayBand, JobStatus } from "../types";

export function JobStatusBadge({ status }: { status: JobStatus | string }) {
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
          Completed
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
