import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  userEmail?: string;
  jobId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  return storage.run({ requestId: context.requestId ?? randomUUID(), ...context }, fn);
}

export function setContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}

export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? "-";
}

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ?? 20;

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < MIN_LEVEL) return;
  const context = storage.getStore();
  const line = {
    severity: level.toUpperCase(),
    timestamp: new Date().toISOString(),
    message,
    request_id: context?.requestId,
    user_email: context?.userEmail,
    job_id: context?.jobId,
    ...fields
  };
  const serialized = JSON.stringify(line, (_key, value) => (value === undefined ? undefined : value));
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, error?: unknown, fields?: Record<string, unknown>) =>
    emit("error", message, {
      ...fields,
      error: error instanceof Error ? error.message : error === undefined ? undefined : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
};

/**
 * Times an operation and logs its duration. Safe under concurrency, unlike
 * console.time(), whose labels collide across simultaneous requests.
 */
export async function timed<T>(action: string, fn: () => Promise<T>, fields: Record<string, unknown> = {}): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log.debug("operation completed", { action, duration_ms: Date.now() - started, status: "ok", ...fields });
    return result;
  } catch (error) {
    log.warn("operation failed", { action, duration_ms: Date.now() - started, status: "error", ...fields });
    throw error;
  }
}
