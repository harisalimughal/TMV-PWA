import React, { useEffect, useState } from "react";
import { ArrowRight, Phone, Users } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { telUrl } from "../../lib/links";
import type { Job } from "../../api/jobs";
import { JobRoute } from "./JobRoute";
import { jobStatusMeta } from "./JobStatusChip";

function gbp(v: number): string {
  return `£${(v ?? 0).toFixed(0)}`;
}

const LONDON = "Europe/London";

function when(iso: string): { time: string; day: string } {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { time: "--:--", day: "" };
  return {
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON }),
    day: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON })
  };
}

/** A quiet "starts in …" chip: how long until (or since) the booked start. Returns
 *  null when the job is running, done/cancelled, or too far out / long past to matter. */
function countdown(job: Job, nowMs: number): { text: string; urgent: boolean } | null {
  if (job.status !== "READY") return null;
  const start = new Date(job.bookedStart).getTime();
  if (Number.isNaN(start)) return null;
  const mins = Math.round((start - nowMs) / 60000);
  if (mins > 8 * 60 || mins < -180) return null;
  if (mins <= 0) return { text: mins > -2 ? "due now" : `${-mins}m late`, urgent: true };
  if (mins < 60) return { text: `in ${mins}m`, urgent: mins <= 15 };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { text: m ? `in ${h}h ${m}m` : `in ${h}h`, urgent: false };
}

/** Map the shared job signal onto one of the three board pill tints. */
const PILL: Record<string, string> = {
  active: "bg-brand-subtle text-brand-subtle-fg",
  upcoming: "bg-brand-subtle text-brand-subtle-fg",
  attention: "bg-warning-subtle text-warning",
  done: "bg-success-subtle text-success",
  cancelled: "bg-danger-subtle text-danger"
};

export interface FeaturedJobCardProps {
  job: Job;
  onOpen: () => void;
}

/**
 * The next / active job — the one hero of the screen. A gradient panel with the
 * Calendar booking title set large in the mono face (e.g. "2 Men - £170 - 16:00"),
 * a status pill, the customer, a drawn pickup→drop-off route, and the two actions a
 * driver takes first: open the job, call. The whole card is a tap target that opens
 * the job; the actions stop propagation.
 */
export function FeaturedJobCard({ job, onOpen }: FeaturedJobCardProps) {
  const meta = jobStatusMeta(job);
  const { time, day } = when(job.bookedStart);
  // The Calendar event title carries the crew / price / time the way ops wrote it.
  // Ops also tack on a "/ N - SD" paid-flag + driver-initials tag the driver doesn't
  // need, so show only what's before the slash. Fall back to the booked time on
  // older jobs that never stored a title.
  const heading = job.rawTitle?.split("/")[0].replace(/[\s-]+$/, "").trim() || time;

  // Keep the "starts in …" chip fresh without a heavy timer — a minute tick is plenty.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const eta = countdown(job, nowMs);

  function open() {
    haptics.tap();
    onOpen();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={cx(
        "block w-full rounded-panel border border-line-strong bg-gradient-to-b from-hero-from to-hero-to p-5 text-left shadow-md",
        "transition-transform duration-fast active:scale-[0.99]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[22px] font-bold leading-tight tracking-normal text-fg break-words">
            {heading}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {day && <span className="font-mono text-meta text-fg-muted">{day}</span>}
            {eta && (
              <span
                className={cx(
                  "inline-flex items-center rounded-pill px-2 py-0.5 font-mono text-meta font-semibold",
                  eta.urgent ? "bg-warning-subtle text-warning" : "bg-surface-sunken text-fg-muted"
                )}
              >
                {eta.text}
              </span>
            )}
          </div>
        </div>
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-helper font-bold",
            PILL[meta.signal] || PILL.upcoming
          )}
        >
          <span className="size-[7px] rounded-full bg-current" aria-hidden />
          {meta.label}
        </span>
      </div>

      <div className="mt-4 text-[19px] font-semibold tracking-normal text-fg [overflow-wrap:anywhere]">
        {job.customerName || "Unnamed customer"}
      </div>

      <JobRoute pickup={job.pickup} dropoff={job.dropoff} density="full" className="mt-4" />

      <div className="mt-[18px] flex items-center gap-3 border-t border-line pt-4">
        <span className="inline-flex items-center gap-1.5 text-body text-fg-muted">
          <Users className="size-[18px] text-fg-subtle" aria-hidden />
          {job.crewSize || "?"} crew
        </span>
        {job.basePrice > 0 && (
          <span className="ml-auto font-mono text-[22px] font-bold tracking-[-0.02em] text-fg">
            {gbp(job.basePrice)}
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            open();
          }}
          className="inline-flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-card bg-brand text-[16px] font-bold text-brand-fg transition-transform duration-fast active:scale-[0.97]"
        >
          View Job
          <ArrowRight className="size-[22px]" aria-hidden />
        </button>
        {job.customerPhone && (
          <a
            href={telUrl(job.customerPhone)}
            onClick={e => e.stopPropagation()}
            aria-label="Call customer"
            className="grid min-h-[56px] w-[56px] shrink-0 place-items-center rounded-card border border-line-strong bg-surface-sunken text-fg transition-transform duration-fast active:scale-[0.97]"
          >
            <Phone className="size-[22px]" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
