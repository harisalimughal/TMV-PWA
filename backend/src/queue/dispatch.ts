import { QueueTask } from "./queue.types";
import { handleProcessJobImage } from "./handlers/image.handler";
import { handleSweepStaleEvidence } from "./handlers/reaper.handler";
import { handleSendClientNotification } from "./handlers/notification.handler";

/**
 * Single place that maps a task to its handler.
 *
 * Shared by the HTTP worker routes (Cloud Tasks) and the inline development driver, so
 * the two paths cannot drift apart.
 */
export async function dispatchTask(task: QueueTask): Promise<unknown> {
  switch (task.type) {
    case "PROCESS_JOB_IMAGE":
      return handleProcessJobImage(task);
    case "SWEEP_STALE_EVIDENCE":
      return handleSweepStaleEvidence();
    case "SEND_CLIENT_NOTIFICATION":
      return handleSendClientNotification(task);
    default: {
      const exhaustive: never = task;
      throw new Error(`Unknown task type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
