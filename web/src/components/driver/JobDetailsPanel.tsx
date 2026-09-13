import React from "react";
import { cx } from "../../ui";
import { htmlToPlainText } from "../../lib/htmlText";
import type { Job } from "../../api/jobs";
import { RawBookingText } from "./RawBookingText";

export interface JobDetailsPanelProps {
  job: Job;
  /** Slot for a call-to-action under the details (e.g. Today's Start Job button).
   *  Omitted entirely for a job that isn't actionable yet (an Upcoming-tab preview,
   *  which has nothing to do but be read). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * The Calendar description exactly as booked -- verbatim, not re-parsed into
 * labelled rows (see lib/htmlText.ts's htmlToPlainText). Name/email/phone used to
 * have their own boxed rows here too, but that's the same information the raw text
 * already carries (Name:/Email:/Phone: lines as the office typed them), so it was
 * dropped rather than shown twice -- calling/emailing the customer is still
 * available once the job is opened (see JobHeader in JobWorkflowScreen.tsx). Shared
 * between <FeaturedJobCard> (Today's expanded job, with a Start Job footer) and the
 * Upcoming tab's read-only row preview (no footer, no route/navigate section above
 * it — a future job isn't actionable yet, so there's nothing to navigate to or start).
 */
export function JobDetailsPanel({ job, footer, className }: JobDetailsPanelProps) {
  const description = job.rawDescription ? htmlToPlainText(job.rawDescription) : "";

  return (
    <div className={cx("rounded-card border border-line bg-surface-sunken/40 p-4", className)}>
      {description ? (
        <RawBookingText text={description} />
      ) : (
        <p className="text-body text-fg-muted">No further details available.</p>
      )}

      {footer}
    </div>
  );
}
