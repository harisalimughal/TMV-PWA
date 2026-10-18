/**
 * Request building and error mapping shared by the admin and driver activity clients.
 * Only describes the wire format; each app supplies its own transport (cookies, timeouts,
 * session-expiry handling already live there).
 */
import type { ActivityQuery, ConversationQuery, ActivityErrorCode } from "./contract";

/** Query string for the activity endpoints. Empty values are omitted; `types` is comma-separated. */
export function activityQueryString(query: ActivityQuery | ConversationQuery | Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === "" || raw === false) continue;
    if (Array.isArray(raw)) { if (raw.length) params.set(key, raw.join(",")); continue; }
    params.set(key, String(raw));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * An error from an activity endpoint. `unavailable` is true when the server does not offer the
 * endpoint at all (404 or 501): the backend for this feature is not deployed, which is a different
 * situation from a failure, and the screens say so instead of showing an error.
 */
export class ActivityApiError extends Error {
  readonly code: ActivityErrorCode | "UNKNOWN" | "OFFLINE";
  readonly status: number;
  readonly unavailable: boolean;
  constructor(message: string, code: ActivityApiError["code"], status: number) {
    super(message);
    this.name = "ActivityApiError";
    this.code = code;
    this.status = status;
    this.unavailable = (status === 404 || status === 501) && code !== "JOB_NOT_FOUND";
  }
}

/** Builds the error for a non-ok response without ever showing a raw HTTP page or object. */
export async function activityErrorFrom(response: { status: number; json: () => Promise<unknown> }, fallback: string): Promise<ActivityApiError> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown } | null;
  const error = data?.error;
  const message = typeof error === "string" ? error : (error as { message?: unknown } | undefined)?.message;
  const code = (error as { code?: unknown } | undefined)?.code;
  return new ActivityApiError(typeof message === "string" && message.trim() ? message : fallback, typeof code === "string" ? (code as ActivityApiError["code"]) : "UNKNOWN", response.status);
}
