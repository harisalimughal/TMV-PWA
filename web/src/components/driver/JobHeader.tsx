import React from "react";
import { ArrowLeft, Phone } from "lucide-react";
import { cx, IconButton } from "../../ui";
import { telUrl } from "../../lib/links";

export interface JobHeaderProps {
  customerName: string;
  jobId: string;
  /** Customer phone — renders a tap-to-call action when present. */
  phone?: string;
  onBack: () => void;
  backLabel?: string;
  /** Optional status indicator shown before the phone action. */
  status?: React.ReactNode;
}

/**
 * The workflow top bar: a back arrow, the job number as an operational label, the
 * customer, and a call action. Compact, ruled, no floating container. The
 * identity block never shifts between steps.
 */
export function JobHeader({
  customerName,
  jobId,
  phone,
  onBack,
  backLabel = "Back to jobs",
  status
}: JobHeaderProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <IconButton
        aria-label={backLabel}
        icon={<ArrowLeft />}
        onClick={onBack}
        className="-ml-1.5 shrink-0 text-fg"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-card text-fg">{customerName || "Unnamed customer"}</p>
        <p className="truncate text-meta text-fg-subtle">Job {jobId}</p>
      </div>

      {status && <div className="shrink-0">{status}</div>}

      {phone && (
        <a
          href={telUrl(phone)}
          aria-label={`Call ${customerName || "the customer"}`}
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-lg text-brand",
            "transition-colors hover:bg-brand-subtle",
            "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
            "[&_svg]:size-[18px]"
          )}
        >
          <Phone />
        </a>
      )}
    </div>
  );
}
