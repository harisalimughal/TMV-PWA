import React from "react";
import { cx } from "../../ui";
import type { Job } from "../../api/jobs";
import { jobStatusMeta, type JobBucket } from "./JobStatusChip";

function gbp(v: number): string {
  return `£${(v ?? 0).toFixed(0)}`;
}

const LONDON = "Europe/London";

function parts(iso: string) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { time: "--:--", day: "" };
  return {
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON }),
    day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: LONDON })
  };
}

/** The postcode / trailing fragment of an address, for the one-line route string. */
function pcOf(addr: string): string {
  const bits = (addr || "").split(",").map(s => s.trim()).filter(Boolean);
  return bits[bits.length - 1] || "";
}

function routeLine(job: Job): string {
  const from = pcOf(job.pickup);
  const to = pcOf(job.dropoff);
  if (!from && !to) return "Route TBC";
  return `${from || "TBC"} → ${to || "TBC"}`;
}

export interface ScheduleRowProps {
  job: Job;
  bucket?: JobBucket;
  onOpen: () => void;
  /** Position in its list — drives the staggered entry animation. */
  index?: number;
}

/**
 * One compact line of the schedule: a mono time column, the customer + a mono
 * route string, then the price. Each row is its own white, shadowed card (not a
 * continuous divided list) so it reads as a distinct tappable item against the
 * page background. A past job that still needs paperwork gets an amber left rule
 * and a "Finish" tag.
 */
export function ScheduleRow({ job, bucket, onOpen, index }: ScheduleRowProps) {
  const { time, day } = parts(job.bookedStart);
  const attn = jobStatusMeta(job, bucket).signal === "attention";

  return (
    <button
      type="button"
      onClick={onOpen}
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 28}ms` } : undefined}
      className={cx(
        "relative grid w-full grid-cols-[54px_1fr_auto] items-center gap-x-3.5 rounded-card bg-surface px-4 py-[15px] text-left shadow-sm",
        "transition-colors duration-fast active:bg-surface-sunken",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        index !== undefined && "row-stagger",
        attn && "before:absolute before:inset-y-3.5 before:left-0 before:w-[3px] before:rounded-[3px] before:bg-warning-signal"
      )}
    >
      <div>
        <div className="font-mono text-[16px] font-semibold tracking-[-0.02em] text-fg">{time}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-fg-subtle">{day}</div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[15.5px] font-bold tracking-[-0.01em] text-fg">
          {job.customerName || "Unnamed customer"}
        </div>
        <div className="mt-[3px] truncate font-mono text-[12.5px] text-fg-muted">{routeLine(job)}</div>
      </div>

      <div className="text-right">
        <div className="font-mono text-[15px] font-semibold text-fg">
          {job.basePrice > 0 ? gbp(job.basePrice) : "—"}
        </div>
        {attn && <div className="mt-1 text-[10.5px] font-bold text-warning">Finish</div>}
      </div>
    </button>
  );
}

/** Structured loading placeholder shaped like a row. */
export function ScheduleRowSkeleton() {
  return (
    <div className="grid grid-cols-[54px_1fr_auto] items-center gap-x-3.5 rounded-card bg-surface px-4 py-[15px] shadow-sm">
      <div>
        <div className="skeleton h-4 w-11 rounded" />
        <div className="skeleton mt-1 h-2.5 w-10 rounded" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="skeleton h-4 w-36 rounded" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
      <div className="skeleton h-4 w-12 rounded justify-self-end" />
    </div>
  );
}
