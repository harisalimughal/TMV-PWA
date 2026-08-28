import { log } from "./logger";

/**
 * 429 means Google rejected the call before applying it, so retrying is always safe.
 * 5xx may mean the write landed and the response was lost, so it is only retried for
 * operations that are naturally idempotent (reads and absolute-position updates).
 */
const RATE_LIMIT_STATUS = new Set([429]);
const SERVER_ERROR_STATUS = new Set([500, 502, 503, 504]);

export type RetryPolicy = "idempotent" | "rate-limit-only";

function statusOf(error: unknown): number | undefined {
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const raw = candidate?.response?.status ?? candidate?.status ?? candidate?.code;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    if (RATE_LIMIT_STATUS.has(status)) return true;
    return policy === "idempotent" && SERVER_ERROR_STATUS.has(status);
  }
  if (policy !== "idempotent") return false;
  const code = (error as { code?: string })?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN" || code === "ENOTFOUND";
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  action: string,
  fn: () => Promise<T>,
  policy: RetryPolicy = "idempotent",
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error, policy)) throw error;
      const backoff = Math.round(200 * 2 ** (attempt - 1) * (0.5 + Math.random()));
      log.warn("retrying Google API call", { action, attempt, backoff_ms: backoff, status: statusOf(error) });
      await sleep(backoff);
    }
  }
  throw lastError;
}

export function withTimeout<T>(action: string, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${action} timed out after ${ms}ms`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
