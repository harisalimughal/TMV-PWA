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
    <div className="flex min-w-0 items-center gap-2">
      <IconButton
        aria-label={backLabel}
        icon={<ArrowLeft />}
        onClick={onBack}
        className="-ml-1.5 shrink-0 text-fg"
      />

      {/* Identity block yields first: it can shrink to nothing and the name ellipsizes,
          so a long customer name never pushes the phone action off-screen. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[19px] font-bold leading-[1.15] text-fg">
          {customerName || "Unnamed customer"}
        </p>
        <p className="truncate text-meta text-fg-subtle">Job {jobId}</p>
      </div>

      {status && <div className="shrink-0">{status}</div>}

      {phone && (
        // The whole pill -- number and icon both -- is one tap target, so the
        // digits themselves call out, not just the icon next to them.
        <a
          href={telUrl(phone)}
          aria-label={`Call ${customerName || "the customer"} on ${phone}`}
          className={cx(
            "-mr-3 ml-3 flex shrink-0 items-center gap-2",
            "transition-transform duration-fast active:scale-95",
            "focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          )}
        >
          <span className="whitespace-nowrap font-mono text-[16px] font-semibold text-brand">
            {phone}
          </span>
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm [&_svg]:size-[20px]"
          >
            <Phone aria-hidden />
          </span>
        </a>
      )}
    </div>
  );
}
