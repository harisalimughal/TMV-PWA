import { NextFunction, Request, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { log, runWithContext } from "../utils/logger";
import { PermanentTaskError, QueueTask, isQueueTask } from "./queue.types";
import { dispatchTask } from "./dispatch";

const verifier = new OAuth2Client();

/**
 * Worker endpoints must never be publicly usable: they write to Sheets and Drive with
 * the service account's authority.
 *
 * Primary: the OIDC token Cloud Tasks attaches, verified against the exact target URL
 * and the expected signer service account.
 * Fallback: a shared secret header, for environments without an OIDC signer.
 */
async function authorizeWorkerRequest(req: Request, res: Response, next: NextFunction) {
  const secret = req.header("x-tmv-worker-secret");
  if (env.workerSharedSecret && secret && timingSafeEqual(secret, env.workerSharedSecret)) {
    return next();
  }

  const match = (req.header("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) {
    log.warn("worker request rejected: no credentials", { path: req.path });
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!env.tasksServiceAccountEmail) {
    log.error("worker request cannot be verified", undefined, {
      path: req.path,
      reason: "TMV_TASKS_SERVICE_ACCOUNT_EMAIL is not configured"
    });
    return res.status(500).json({ error: "Worker authentication is not configured." });
  }

  try {
    const audience = `${env.workerBaseUrl}${req.baseUrl}${req.path}`;
    const ticket = await verifier.verifyIdToken({ idToken: match[1], audience });
    const payload = ticket.getPayload();
    if (payload?.email !== env.tasksServiceAccountEmail || !payload?.email_verified) {
      log.warn("worker request rejected: unexpected signer", { path: req.path, email: payload?.email });
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  } catch (error) {
    log.warn("worker request rejected: token verification failed", { path: req.path, error: String(error) });
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Runs a task and maps the outcome onto the HTTP contract Cloud Tasks understands.
 *
 *   200 -> done, or permanently failed and already recorded. Stop.
 *   500 -> transient. Retry with the queue's configured backoff.
 *
 * Returning 200 for a permanent failure is deliberate: retrying a non-image attachment
 * five times helps nobody, and the evidence record already carries FAILED so the driver
 * is prompted to re-upload.
 */
function runTask(expected: QueueTask["type"]) {
  return async (req: Request, res: Response) => {
    const requestId = req.header("x-tmv-request-id") || randomUUID();
    const attempt = Number(req.header("x-cloudtasks-taskretrycount") ?? 0);

    await runWithContext({ requestId }, async () => {
      const started = Date.now();
      const body = req.body;

      if (!isQueueTask(body) || body.type !== expected) {
        log.error("worker received a malformed task", undefined, { expected, received: (body as any)?.type });
        // Never retry a payload that can never be valid.
        return res.status(200).json({ ok: false, error: "Malformed task payload; discarded." });
      }

      try {
        const result = await dispatchTask(body);
        log.info("task completed", {
          task_type: body.type,
          attempt,
          duration_ms: Date.now() - started,
          status: "ok"
        });
        return res.status(200).json({ ok: true, result: result ?? null });
      } catch (error) {
        const permanent = error instanceof PermanentTaskError;
        log.error("task failed", error, {
          task_type: body.type,
          attempt,
          permanent,
          duration_ms: Date.now() - started,
          status: "error"
        });
        return res
          .status(permanent ? 200 : 500)
          .json({ ok: false, permanent, error: error instanceof Error ? error.message : String(error) });
      }
    });
  };
}

/**
 * Mounted at WORKER_MOUNT_PATH, never at root: router.use() runs its middleware for
 * every request that reaches the router, so mounting this at "/" would put worker
 * authentication in front of /chat and /healthz.
 */
export const WORKER_MOUNT_PATH = "/internal/tasks";

export function workerRouter(): Router {
  const router = Router();
  router.use(authorizeWorkerRequest);
  router.post("/process-image", runTask("PROCESS_JOB_IMAGE"));
  router.post("/sweep-evidence", runTask("SWEEP_STALE_EVIDENCE"));
  return router;
}
