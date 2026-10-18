import { Badge, type BadgeTone } from "./Badge";

/**
 * The single mapping from a domain status string to a badge tone + human label.
 * Every status pill in the app should come from here so the semantic colour system
 * stays consistent (green = done/active, blue = in progress, amber = attention,
 * red = failed/cancelled, neutral = draft/inactive).
 */

type StatusKind = "job" | "evidence" | "delivery";

interface StatusMeta {
  tone: BadgeTone;
  label: string;
  dot?: boolean;
}

const JOB: Record<string, StatusMeta> = {
  READY: { tone: "neutral", label: "Ready" },
  IN_PROGRESS: { tone: "info", label: "In progress", dot: true },
  COMPLETED: { tone: "success", label: "Completed" },
  CANCELLED: { tone: "danger", label: "Cancelled" }
};

const EVIDENCE: Record<string, StatusMeta> = {
  MISSING: { tone: "neutral", label: "Missing" },
  PROCESSING: { tone: "info", label: "Processing", dot: true },
  COMPLETED: { tone: "success", label: "Received" },
  FAILED: { tone: "danger", label: "Failed" }
};

const DELIVERY: Record<string, StatusMeta> = {
  sent: { tone: "success", label: "Sent" },
  pending: { tone: "info", label: "Pending", dot: true },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "neutral", label: "No target" },
  disabled: { tone: "neutral", label: "Off" }
};

const TABLES: Record<StatusKind, Record<string, StatusMeta>> = {
  job: JOB,
  evidence: EVIDENCE,
  delivery: DELIVERY
};

export interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  className?: string;
}

export function StatusBadge({ kind, status, className }: StatusBadgeProps) {
  const meta = TABLES[kind][status] ?? { tone: "neutral" as BadgeTone, label: status };
  return (
    <Badge tone={meta.tone} dot={meta.dot} className={className}>
      {meta.label}
    </Badge>
  );
}
