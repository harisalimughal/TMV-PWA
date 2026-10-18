/**
 * Status vocabulary. Each dimension of a job is its own badge with its own words --
 * job status, payment, evidence, driver-viewed and review are independent facts
 * (audit p.7: "Completed does not mean paid or fully documented").
 */
import React from "react";
import type { NormalizedJob } from "../types";
import { Badge, type Tone } from "./ds";
import { hasInvoice, missingEvidence } from "../hooks/useAttention";
import { formatShortDateTime } from "../utils/format";
import { DateTime } from "luxon";
import { AlertTriangle } from "lucide-react";

const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  READY: { label: "Scheduled", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" }
};

export function jobStatusLabel(status: string): string {
  return JOB_STATUS[status]?.label ?? (status ? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()) : "Unknown");
}

export function JobStatusBadge({ status, activity = [] }: { status: string; activity?: ReadonlyArray<{ action: string }> }) {
  const meta = JOB_STATUS[status] ?? { label: jobStatusLabel(status), tone: "neutral" as Tone };
  return <Badge tone={meta.tone}>{status === "COMPLETED" && activity.some(e => e.action === "ADMIN_MARKED_COMPLETED") ? "Admin Completed" : meta.label}</Badge>;
}

export function JobRescheduleWarning({ notice }: { notice?: NormalizedJob["rescheduleNotice"] }) {
  if (!notice) return null;
  const admin = notice.kind === "admin-completed";
  const scheduled = DateTime.fromISO(notice.scheduledStart).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm");
  return <span className={`mt-3 flex w-full min-w-0 items-start gap-1.5 rounded-control border px-2 py-1.5 text-left text-[12px] font-medium whitespace-normal ${admin ? "bg-admin-status-amber-bg text-admin-status-amber border-admin-status-amber/20" : "bg-admin-status-red-bg text-admin-status-red border-admin-status-red/20"}`}
    title={`Calendar schedule: ${scheduled}; driver: ${notice.driverInitials || "Unassigned"}`}>
    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
    <span className="min-w-0 break-words">{admin ? "Admin completed job reassigned" : "Completed job reassigned"}</span>
  </span>;
}

/** Compatibility for the retained completed-jobs screen. */
export function DelayBandBadge({ band, minutes }: { band: string; minutes: number }) {
  const early = minutes < 0 || band === "EARLY", onTime = minutes === 0 || band === "ON_TIME";
  return <Badge tone={onTime ? "success" : early ? "info" : band === "LATE_5_15" ? "warning" : "danger"}>{onTime ? "On time" : early ? `${Math.abs(minutes)}m early` : `+${minutes}m delay`}</Badge>;
}

/** Evidence completeness, independent of job status. */
export function evidenceState(job: NormalizedJob): { label: string; tone: Tone; missing: string[] } {
  const missing = missingEvidence(job);
  if (job.status !== "COMPLETED") return { label: missing.length ? "Evidence in progress" : "Evidence on track", tone: "neutral", missing };
  return missing.length ? { label: "Evidence incomplete", tone: "warning", missing } : { label: "Evidence complete", tone: "success", missing };
}

/** Payment as recorded at completion. "Paid" is never inferred: an invoice row means
 *  money was billed, not received. */
export function paymentState(job: NormalizedJob): { label: string; tone: Tone } {
  if (job.status !== "COMPLETED") return { label: "Not yet charged", tone: "neutral" };
  if (hasInvoice(job)) return { label: "Invoice to collect", tone: "warning" };
  if (job.paymentBreakdown?.length) return { label: "Receipt recorded", tone: "success" };
  return { label: "Payment not recorded", tone: "warning" };
}

/** "Viewed by driver" means the driver opened the job in the app -- not that they
 *  accepted it, and not a WhatsApp/SMS read receipt. */
export function DriverViewedBadge({ viewedAt }: { viewedAt?: string }) {
  if (!viewedAt) return <Badge tone="neutral" title="The driver has not opened this job in the app yet">Not viewed by driver</Badge>;
  return <Badge tone="info" title={`Driver opened this job in the app ${formatShortDateTime(viewedAt)}. This is not an acceptance or a message read receipt.`}>Viewed by driver</Badge>;
}

export function ReviewBadge({ status }: { status?: "Pending" | "Approved" | "Flagged" }) {
  if (status === "Approved") return <Badge tone="success">Review: approved</Badge>;
  if (status === "Flagged") return <Badge tone="danger">Review: flagged</Badge>;
  return <Badge tone="neutral">Review: not reviewed</Badge>;
}
