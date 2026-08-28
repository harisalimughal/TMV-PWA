import { google, cloudtasks_v2 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { withRetry, withTimeout } from "../utils/retry";
import { currentRequestId, log } from "../utils/logger";
import { QueueTask, TASK_ROUTES, taskDedupeId } from "./queue.types";

export interface EnqueueOptions {
  /** Delay before the worker is first invoked. */
  delaySeconds?: number;
  /** Overrides the derived dedupe id. Used by the reaper to force a fresh attempt. */
  dedupeId?: string;
}

export interface EnqueueResult {
  queued: boolean;
  /** True when Cloud Tasks rejected the name as already existing — an idempotent no-op. */
  duplicate: boolean;
  driver: "cloud-tasks" | "inline";
  taskId: string;
}

interface QueueDriver {
  readonly name: "cloud-tasks" | "inline";
  enqueue(task: QueueTask, taskId: string, options: EnqueueOptions): Promise<EnqueueResult>;
}

// ---------------------------------------------------------------------------
// Cloud Tasks driver (production)
// ---------------------------------------------------------------------------

let tasksClientPromise: Promise<cloudtasks_v2.Cloudtasks> | null = null;

async function tasksClient(): Promise<cloudtasks_v2.Cloudtasks> {
  if (!tasksClientPromise) {
    tasksClientPromise = createGoogleAuth(SCOPES.CLOUD_TASKS)
      .then(auth => google.cloudtasks({ version: "v2", auth }))
      .catch(error => {
        tasksClientPromise = null;
        throw error;
      });
  }
  return tasksClientPromise;
}

function queuePath(): string {
  return `projects/${env.gcpProject}/locations/${env.tasksLocation}/queues/${env.tasksQueue}`;
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const raw = candidate?.response?.status ?? candidate?.status ?? candidate?.code;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

const cloudTasksDriver: QueueDriver = {
  name: "cloud-tasks",

  async enqueue(task, taskId, options): Promise<EnqueueResult> {
    const client = await tasksClient();
    const url = `${env.workerBaseUrl}${TASK_ROUTES[task.type]}`;
    const parent = queuePath();

    const body: cloudtasks_v2.Schema$Task = {
      name: `${parent}/tasks/${taskId}`,
      httpRequest: {
        url,
        httpMethod: "POST",
        headers: {
          "Content-Type": "application/json",
          // Carried through so worker logs join to the originating driver interaction.
          "X-TMV-Request-Id": currentRequestId()
        },
        body: Buffer.from(JSON.stringify(task), "utf8").toString("base64"),
        // OIDC is the primary worker auth. The shared secret exists only as a fallback
        // for environments where an OIDC signer service account is not available.
        ...(env.tasksServiceAccountEmail
          ? { oidcToken: { serviceAccountEmail: env.tasksServiceAccountEmail, audience: url } }
          : {})
      }
    };

    if (options.delaySeconds && options.delaySeconds > 0) {
      body.scheduleTime = new Date(Date.now() + options.delaySeconds * 1000).toISOString();
    }

    try {
      // Hard timeout: enqueue sits on the driver's critical path, so it must never be
      // the thing that holds a Chat response open.
      await withTimeout(
        "cloudtasks.create",
        withRetry(
          "cloudtasks.tasks.create",
          () => client.projects.locations.queues.tasks.create({ parent, requestBody: { task: body } }),
          // Named tasks make create naturally idempotent, so 5xx is safe to retry.
          "idempotent"
        ),
        env.enqueueTimeoutMs
      );
      return { queued: true, duplicate: false, driver: "cloud-tasks", taskId };
    } catch (error) {
      if (statusOf(error) === 409) {
        log.info("task already queued; enqueue is a no-op", { task_type: task.type, task_id: taskId });
        return { queued: true, duplicate: true, driver: "cloud-tasks", taskId };
      }
      throw error;
    }
  }
};

// ---------------------------------------------------------------------------
// Inline driver (local development only)
// ---------------------------------------------------------------------------

type Dispatcher = (task: QueueTask) => Promise<void>;

let inlineDispatcher: Dispatcher | null = null;

/**
 * Wired up by server.ts at boot. Kept as a registration hook rather than an import so
 * queue.service does not depend on the handlers, which depend on it.
 */
export function registerInlineDispatcher(dispatcher: Dispatcher): void {
  inlineDispatcher = dispatcher;
}

/** Every inline task currently running. Used by tests and SIGTERM to wait for drain. */
const inFlight = new Set<Promise<unknown>>();

export function drainInlineQueue(): Promise<unknown> {
  return Promise.allSettled(inFlight);
}

const inlineDriver: QueueDriver = {
  name: "inline",

  async enqueue(task, taskId): Promise<EnqueueResult> {
    if (!inlineDispatcher) throw new Error("Inline queue driver has no dispatcher registered.");
    const dispatcher = inlineDispatcher;

    // Deliberately NOT awaited by the caller: the point is that the response returns
    // first. Durability here comes from the Evidence row plus the reaper, not from this
    // promise surviving — which is exactly why this driver is not for production.
    //
    // Each task runs independently (not chained after the previous one) so that, e.g.,
    // four photo-upload tasks enqueued together download/upload concurrently instead of
    // queueing behind each other. This mirrors Cloud Tasks, which delivers tasks as
    // separate concurrent HTTP requests rather than one at a time.
    const run: Promise<unknown> = dispatcher(task)
      .catch(error => log.error("inline task failed", error, { task_type: task.type, task_id: taskId }))
      .finally(() => inFlight.delete(run));
    inFlight.add(run);

    return { queued: true, duplicate: false, driver: "inline", taskId };
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function activeDriver(): QueueDriver {
  return env.queueDriver === "cloud-tasks" ? cloudTasksDriver : inlineDriver;
}

/**
 * Hands a task to the configured background mechanism.
 *
 * Never throws. A failed enqueue is reported but does not fail the driver's action,
 * because the Evidence row is already durable and the reaper (SWEEP_STALE_EVIDENCE)
 * will pick up anything the queue lost. Failing the driver's action here would trade a
 * recoverable delay for an unrecoverable workflow interruption.
 */
export async function enqueue(task: QueueTask, options: EnqueueOptions = {}): Promise<EnqueueResult> {
  const taskId = options.dedupeId ?? taskDedupeId(task);
  const driver = activeDriver();
  const started = Date.now();

  try {
    const result = await driver.enqueue(task, taskId, options);
    log.debug("task enqueued", {
      task_type: task.type,
      task_id: taskId,
      driver: result.driver,
      duplicate: result.duplicate,
      duration_ms: Date.now() - started
    });
    return result;
  } catch (error) {
    log.error("enqueue failed; reaper will recover", error, {
      task_type: task.type,
      task_id: taskId,
      driver: driver.name,
      duration_ms: Date.now() - started
    });
    return { queued: false, duplicate: false, driver: driver.name, taskId };
  }
}

/** Enqueues several tasks concurrently. Resolves after all attempts settle. */
export async function enqueueAll(tasks: QueueTask[], options: EnqueueOptions = {}): Promise<EnqueueResult[]> {
  return Promise.all(tasks.map(task => enqueue(task, options)));
}
