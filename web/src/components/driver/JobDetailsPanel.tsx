import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { mailtoUrl, telUrl } from "../../lib/links";
import { htmlToPlainText } from "../../lib/htmlText";
import type { Job } from "../../api/jobs";
import { BookingText } from "./BookingText";

/** Placeholder for a detail the backend hasn't sent. */
const NO_VALUE = "—";

function ContactRow({ label, value, href }: { label: string; value?: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-body text-fg-muted">{label}</span>
      {value && href ? (
        <a
          href={href}
          onClick={e => e.stopPropagation()}
          className="max-w-[65%] text-right text-card font-semibold text-brand underline-offset-2 [overflow-wrap:anywhere] hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="max-w-[65%] text-right text-card font-semibold text-fg [overflow-wrap:anywhere]">
          {value?.trim() || NO_VALUE}
        </span>
      )}
    </div>
  );
}

export interface JobDetailsPanelProps {
  job: Job;
  /** Slot for a call-to-action under the details (e.g. Today's Start Job button).
   *  Omitted entirely for a job that isn't actionable yet (an Upcoming-tab preview,
   *  which has nothing to do but be read). */
  footer?: React.ReactNode;
  /** Values already shown elsewhere on the same card (above this panel) that
   *  shouldn't repeat inside "More details" -- e.g. <FeaturedJobCard> already shows
   *  the extra-charge note and the pickup/drop-off route above this panel, so it
   *  passes those in here. Name/email/phone are always excluded regardless, since
   *  this panel shows those itself. */
  excludeValues?: Array<string | undefined>;
  /** Skips the "More details" toggle and shows everything immediately -- used for
   *  the Upcoming tab, where tapping the row itself is already the expand action;
   *  a second collapse toggle nested inside that would just be redundant. Today's
   *  <FeaturedJobCard> leaves this off (the default), since there the card is
   *  already showing plenty and the rest is opt-in. */
  alwaysExpanded?: boolean;
  className?: string;
}

/**
 * Name / email / phone, then the rest of the booking (van, hire time, floors, extra
 * request, inventory) behind a "More details" toggle. Shared between
 * <FeaturedJobCard> (Today's expanded job, with a Start Job footer) and the
 * Upcoming tab's read-only row preview (no footer, no route/navigate section above
 * it — a future job isn't actionable yet, so there's nothing to navigate to or start).
 */
export function JobDetailsPanel({ job, footer, excludeValues, alwaysExpanded, className }: JobDetailsPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const description = job.rawDescription ? htmlToPlainText(job.rawDescription) : "";
  const showDetails = alwaysExpanded || detailsOpen;

  return (
    <div className={cx("rounded-card border border-line bg-surface-sunken/40 p-4", className)}>
      <div className="flex flex-col gap-2.5">
        <ContactRow label="Name" value={job.customerName} />
        <ContactRow
          label="Email"
          value={job.customerEmail}
          href={job.customerEmail ? mailtoUrl(job.customerEmail) : undefined}
        />
        <ContactRow
          label="Phone"
          value={job.customerPhone}
          href={job.customerPhone ? telUrl(job.customerPhone) : undefined}
        />
      </div>

      {!alwaysExpanded && (
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setDetailsOpen(v => !v);
          }}
          className="mt-3 flex w-full items-center justify-between gap-2 border-t border-line pt-3 text-helper font-semibold text-brand"
        >
          {detailsOpen ? "Hide details" : "More details"}
          {detailsOpen ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
        </button>
      )}

      {showDetails && (
        <div className="mt-0.5 border-t border-line">
          {description ? (
            <BookingText
              text={description}
              excludeValues={[job.customerName, job.customerEmail, job.customerPhone, ...(excludeValues ?? [])]}
            />
          ) : (
            <p className="py-2 text-body text-fg-muted">No further details available.</p>
          )}
        </div>
      )}

      {footer}
    </div>
  );
}
