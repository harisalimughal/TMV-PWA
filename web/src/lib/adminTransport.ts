import { SERVER_ERROR_MESSAGE } from "./apiErrors";
import { adminReadHeaders } from "./adminDriverScope";

export const ADMIN_SESSION_EXPIRED = "tmv:admin-session-expired";
export class AdminRequestError extends Error {
  constructor(message: string, public code: string, public status?: number) { super(message); this.name = "AdminRequestError"; }
}

/** Same-origin cookies and unchanged request contracts, with bounded waiting and session feedback. */
export async function adminFetch(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response: Response;
  try {
    const read = ["GET", "HEAD"].includes((init.method || "GET").toUpperCase());
    response = await fetch(path, { credentials: "same-origin", ...init, ...(read ? { headers: adminReadHeaders(init.headers) } : {}), signal: controller.signal });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timedOut) throw new AdminRequestError("The request timed out. Check your connection and try again.", "TIMEOUT");
    throw new AdminRequestError(SERVER_ERROR_MESSAGE, "SERVER_UNREACHABLE");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
  if (response.status === 401 && path !== "/api/admin/login" && path !== "/api/admin/me") {
    window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED));
    throw new AdminRequestError("Your admin session expired. Sign in again.", "UNAUTHORIZED", 401);
  }
  if (response.status >= 500) throw new AdminRequestError(SERVER_ERROR_MESSAGE, "SERVER_ERROR", response.status);
  return response;
}
