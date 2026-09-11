import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { useOnline } from "../../lib/net";
import { startJob, type ApiError, type Job } from "../../api/jobs";
import { useToast } from "../ui/Toast";
import { JobRoute } from "./JobRoute";
import { JobDetailsPanel } from "./JobDetailsPanel";
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
  /** Fires once the job is confirmed started (or was already in progress) — the
   *  caller opens the workflow screen, which lands on whatever step the job is
   *  actually on (arrival photo for a fresh start, wherever it left off otherwise). */
  onStarted: (jobId: string) => void;
}

/**
 * The driver's active/next job, shown in full on the Jobs list itself — there's no
 * separate "View Job" screen to tap through to any more (see JobListScreen.tsx's
 * TodayJobsList, which keeps exactly one job expanded like this at a time). Booking
 * window header, status, the booking's extra-charge note, the pickup/drop-off route
 * (each address tap-to-navigate with a copy icon), then <JobDetailsPanel> (contact +
 * the rest of the booking) with Start Job as its footer.
 */
export function FeaturedJobCard({ job, onStarted }: FeaturedJobCardProps) {
  const day = dateChip(job.bookedStart);
  const online = useOnline();
  const toast = useToast();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (!online) {
      haptics.warn();
      toast.error("You're offline — reconnect to start this job.");
      return;
    }
    haptics.tap();
    setStarting(true);
    try {
      await startJob(job.jobId);
      onStarted(job.jobId);
    } catch (err) {
      toast.error((err as ApiError)?.message || "Couldn't start this job. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div
      className={cx(
        "block w-full rounded-panel border border-line-strong bg-surface p-4 text-left",
        "shadow-[0_1px_3px_rgb(15_23_42/0.08),0_12px_28px_-10px_rgb(15_23_42/0.22)]"
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

      {/* The booking's own overtime/extra-charge note, verbatim from Calendar. */}
      {job.extraChargeText && (
        <p className="mt-3 text-helper text-fg-muted">
          <span className="font-semibold text-fg">Any extra charge:</span> {job.extraChargeText}
        </p>
      )}

      <JobRoute
        pickup={job.pickup}
        dropoff={job.dropoff}
        stop={job.stopBy}
        density="full"
        interactive
        className="mt-4"
      />

      <JobDetailsPanel
        job={job}
        className="mt-[18px]"
        excludeValues={[job.pickup, job.dropoff, job.stopBy, job.extraChargeText]}
        footer={
          <button
            type="button"
            disabled={starting}
            aria-busy={starting || undefined}
            onClick={handleStart}
            className={cx(bigActionButtonClass, "mt-4")}
          >
            {starting ? "Starting…" : "Start Job"}
            {!starting && <ArrowRight className="size-[22px]" aria-hidden />}
          </button>
        }
      />
    </div>
  );
}
