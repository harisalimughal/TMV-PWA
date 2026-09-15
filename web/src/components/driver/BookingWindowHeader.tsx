import React from "react";
import type { Job } from "../../api/jobs";

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

export interface BookingWindowHeaderProps {
  job: Job;
}

/**
 * The crew+price / time-range / date-chip badge every job card leads with — shared
 * by <FeaturedJobCard> (Today's expanded job) and <UpcomingJobCard> (each Upcoming
 * job's always-visible collapsed state, expanding to the rest of the card on tap).
 */
export function BookingWindowHeader({ job }: BookingWindowHeaderProps) {
  const day = dateChip(job.bookedStart);

  return (
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
  );
}
