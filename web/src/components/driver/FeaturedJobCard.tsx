import React, { useState } from "react";
import { ArrowRight, Navigation } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { useOnline } from "../../lib/net";
import { sendOnMyWay, startJob, type ApiError, type Job } from "../../api/jobs";
import { notifyJobsRefresh } from "../../lib/jobsRefresh";
import { useToast } from "../ui/Toast";
import { BookingWindowHeader } from "./BookingWindowHeader";
import { CustomerIdentity } from "./CustomerIdentity";
import { JobDetailsPanel } from "./JobDetailsPanel";
import { bigActionButtonClass } from "./bigActionButton";
import { STEPS } from "../../screens/workflow/steps";

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
 * window header, <CustomerIdentity> (name + tap-to-call, same pairing as the
 * workflow's JobHeader minus its icon and job number), then <JobDetailsPanel> (the
 * raw booking text, which already carries the pickup/drop-off addresses and any
 * extra-charge note verbatim) with Start Job as its footer.
 */
export function FeaturedJobCard({ job, onStarted }: FeaturedJobCardProps) {
  const online = useOnline();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  // Optimistic -- notifyJobsRefresh() below re-fetches the authoritative job list, but
  // that's a network round trip; without this the button would flash back for the gap
  // between the send succeeding and the refetch landing.
  const [sentLocally, setSentLocally] = useState(false);

  // Once the job has actually moved past READY, the button names whatever step is
  // next rather than always reading "Start Job" -- that's what lets the driver
  // resume from here after each step now bounces back to Home (see
  // JobWorkflowScreen.tsx's run()).
  const inProgress = Boolean(job.currentState && job.currentState !== "READY" && job.currentState !== "COMPLETED");
  const startLabel = inProgress ? STEPS[job.currentState]?.shortLabel ?? "Continue" : "Start Job";
  // The customer has to be told the driver's coming before the job can start (see
  // jobs.service.ts's startJob, which now rejects a start with no onMyWayAt) -- a job
  // already in progress always has this set already, from whenever it first started.
  const needsOnMyWay = job.status === "READY" && !job.onMyWayAt && !sentLocally;

  async function handleOnMyWay() {
    if (!online) {
      haptics.warn();
      toast.error("You're offline — reconnect to notify the customer.");
      return;
    }
    haptics.tap();
    setNotifying(true);
    try {
      await sendOnMyWay(job.jobId);
      setSentLocally(true);
      notifyJobsRefresh();
    } catch (err) {
      toast.error((err as ApiError)?.message || "Couldn't notify the customer. Try again.");
    } finally {
      setNotifying(false);
    }
  }

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
      <BookingWindowHeader job={job} />

      <div className="mt-4">
        <CustomerIdentity customerName={job.customerName} customerPhone={job.customerPhone} />
      </div>

      {needsOnMyWay && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            disabled={notifying}
            aria-busy={notifying || undefined}
            onClick={handleOnMyWay}
            className={cx(
              "flex items-center gap-1.5 rounded-pill bg-brand px-3.5 py-2 text-label font-bold text-white",
              "transition-transform duration-fast active:scale-95 disabled:opacity-60"
            )}
          >
            <Navigation className="size-4" aria-hidden />
            {notifying ? "Notifying…" : "I'm on the Way"}
          </button>
        </div>
      )}

      <JobDetailsPanel
        job={job}
        className="mt-4"
        footer={
          needsOnMyWay ? (
            <p className="mt-4 text-center text-helper text-fg-subtle">
              Tap "I'm on the Way" above to let the customer know, then Start Job appears here.
            </p>
          ) : (
            <button
              type="button"
              disabled={starting}
              aria-busy={starting || undefined}
              onClick={handleStart}
              className={cx(bigActionButtonClass, "mt-4")}
            >
              {starting ? "Starting…" : startLabel}
              {!starting && <ArrowRight className="size-[22px]" aria-hidden />}
            </button>
          )
        }
      />
    </div>
  );
}
