import React from "react";
import { ArrowRight, Users } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { telUrl } from "../../lib/links";
import type { Job } from "../../api/jobs";
import { JobRoute } from "./JobRoute";
import { StatusIndicator } from "./JobStatusChip";
import { bigActionButtonClass } from "./bigActionButton";

const LONDON = "Europe/London";

/** British month abbreviations, upper-case — "SEPT" not "SEP". */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];

function hhmm(iso: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON });
}

/** The booked window straight off the Calendar event — start–end, in London time. */
function timeRange(job: Job): string {
  const start = hhmm(job.bookedStart);
  const end = hhmm(job.bookedFinish);
  return end === "--:--" ? start : `${start}–${end}`;
}

/** "WED 9 SEPT" from the booked start, in London time. */
function dateChip(iso: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: LONDON
  }).formatToParts(d);
  const weekday = p.find(x => x.type === "weekday")?.value ?? "";
  const day = p.find(x => x.type === "day")?.value ?? "";
  const monthIdx = Number(p.find(x => x.type === "month")?.value ?? "0") - 1;
  const month = MONTHS[monthIdx] ?? "";
  return `${weekday} ${day} ${month}`.toUpperCase();
}

/** "2 men 210£" — crew and booked price, the way the board reads it. */
function crewPrice(job: Job): string {
  const n = job.crewSize || 0;
  const crew = `${n || "?"} ${n === 1 ? "man" : "men"}`;
  return job.basePrice > 0 ? `${crew} ${Math.round(job.basePrice)}£` : crew;
}

export interface FeaturedJobCardProps {
  job: Job;
  onOpen: () => void;
}

/**
 * The next / active job — the one hero of the screen. A crew/price pill and the
 * Calendar booking window (start–end, red) sit in a small header card, then the
 * status, the drawn pickup→drop-off route, the customer with a tap-to-call number,
 * the crew size and van, and a full-width View Job button. The whole card is a tap
 * target that opens the job; the inner actions stop propagation.
 */
export function FeaturedJobCard({ job, onOpen }: FeaturedJobCardProps) {
  const day = dateChip(job.bookedStart);

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
        "block w-full rounded-panel border border-line-strong bg-surface p-4 text-left",
        "shadow-[0_1px_3px_rgb(15_23_42/0.08),0_12px_28px_-10px_rgb(15_23_42/0.22)]",
        "transition-transform duration-fast active:scale-[0.99]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      )}
    >
      {/* Booking window header */}
      <div className="rounded-card border border-line/40 bg-surface px-4 py-3 text-center shadow-[0_2px_12px_-2px_rgb(15_23_42/0.12)]">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center rounded-none bg-success-subtle px-2.5 py-1 text-helper font-bold text-success">
            {crewPrice(job)}
          </span>
          <span className="text-fg-subtle" aria-hidden>
            &ndash;
          </span>
          <span className="font-mono text-[17px] font-bold tracking-[-0.01em] text-danger">
            {timeRange(job)}
          </span>
        </div>
        {day && (
          <div className="mt-2 inline-flex items-center rounded-none bg-surface-sunken px-2.5 py-0.5 font-mono text-meta font-semibold text-fg-muted">
            {day}
          </div>
        )}
      </div>

      <div className="mt-4">
        <StatusIndicator job={job} />
      </div>

      <JobRoute pickup={job.pickup} dropoff={job.dropoff} stop={job.stopBy} density="full" className="mt-4" />

      {/* Indented to line up with the address text in <JobRoute> above (24px rail
          column + 14px gap-x-3.5). */}
      <div className="mt-3 pl-[38px] text-[17px] font-semibold text-fg [overflow-wrap:anywhere]">
        {job.customerName || "Unnamed customer"}
        {job.customerPhone && (
          <>
            {"  "}
            <a
              href={telUrl(job.customerPhone)}
              onClick={e => e.stopPropagation()}
              className="font-mono text-[15px] font-semibold text-brand"
            >
              {job.customerPhone}
            </a>
          </>
        )}
      </div>

      <div className="mt-[18px] flex items-center gap-3 border-t border-line pt-4">
        <span className="inline-flex items-center gap-1.5 text-body text-fg-muted">
          <Users className="size-[18px] text-fg-subtle" aria-hidden />
          {job.crewSize || "?"} crew
        </span>
        {job.vanSize && (
          <span className="ml-auto text-body font-semibold text-fg">{job.vanSize}</span>
        )}
      </div>

      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          open();
        }}
        className={cx(bigActionButtonClass, "-mx-2 mt-5")}
      >
        View Job
        <ArrowRight className="size-[22px]" aria-hidden />
      </button>
    </div>
  );
}
