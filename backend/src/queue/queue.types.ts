/**
 * Task contracts for background processing.
 *
 * Payloads carry identifiers only, never business data. The worker re-reads the
 * authoritative record (Evidence row, Bookings row) from Sheets, so a task that sits
 * in the queue through a config change or a retry still operates on current state.
 */

export type TaskType = "PROCESS_JOB_IMAGE" | "SWEEP_STALE_EVIDENCE" | "SEND_CLIENT_NOTIFICATION";

export interface ProcessJobImageTask {
  type: "PROCESS_JOB_IMAGE";
  evidenceId: string;
  jobId: string;
}

export interface SweepStaleEvidenceTask {
  type: "SWEEP_STALE_EVIDENCE";
}

export interface SendClientNotificationTask {
  type: "SEND_CLIENT_NOTIFICATION";
  jobId: string;
}

export type QueueTask = ProcessJobImageTask | SweepStaleEvidenceTask | SendClientNotificationTask;

/** Worker HTTP paths. Cloud Tasks targets these directly. */
export const TASK_ROUTES: Record<TaskType, string> = {
  PROCESS_JOB_IMAGE: "/internal/tasks/process-image",
  SWEEP_STALE_EVIDENCE: "/internal/tasks/sweep-evidence",
  SEND_CLIENT_NOTIFICATION: "/internal/tasks/send-client-notification"
};

/**
 * Stable per-task identity. Cloud Tasks rejects a duplicate task name, which gives
 * enqueue-side idempotency for free: a redelivered Chat event that re-enqueues the
 * same evidence is a no-op rather than a second Drive upload.
 *
 * Must match [a-zA-Z0-9_-]{1,500}.
 */
export function taskDedupeId(task: QueueTask): string {
  switch (task.type) {
    case "PROCESS_JOB_IMAGE":
      return `image-${task.evidenceId}`;
    case "SWEEP_STALE_EVIDENCE":
      // Time-bucketed: the sweep is meant to recur, so it must not dedupe forever.
      return `sweep-${Math.floor(Date.now() / 60_000)}`;
    case "SEND_CLIENT_NOTIFICATION":
      return `client-notif-${task.jobId}`;
    default:
      return `task-${Date.now()}`;
  }
}

export function isQueueTask(value: unknown): value is QueueTask {
  const type = (value as { type?: unknown })?.type;
  return type === "PROCESS_JOB_IMAGE" || type === "SWEEP_STALE_EVIDENCE" || type === "SEND_CLIENT_NOTIFICATION";
}

/**
 * Thrown by a handler when retrying cannot possibly succeed — a non-image attachment,
 * a deleted Chat message, an oversized file. The worker converts this to HTTP 200 so
 * Cloud Tasks stops retrying, and the evidence is marked FAILED for driver re-upload.
 */
export class PermanentTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentTaskError";
  }
}
