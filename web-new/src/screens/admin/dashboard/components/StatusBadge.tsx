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

const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  READY: { label: "Scheduled", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" }
};

export function jobStatusLabel(status: string): string {
  return JOB_STATUS[status]?.label ?? (status ? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()) : "Unknown");
}

export function JobStatusBadge({ status }: { status: string }) {
  const meta = JOB_STATUS[status] ?? { label: jobStatusLabel(status), tone: "neutral" as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
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
