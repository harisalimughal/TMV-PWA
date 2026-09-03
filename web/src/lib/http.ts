/**
 * One place where every driver-app request goes through.
 *
 * Previously each api/*.ts function called fetch() directly, which meant three things
 * were missing everywhere at once:
 *
 *  1. No 401 recovery. If the session cookie expired mid-job, every subsequent call
 *     surfaced the generic "Something went wrong. Try again." forever -- the driver
 *     retried, it kept failing, and there was no route back to the login screen short
 *     of clearing the app. Now a 401 on any authenticated call fires onUnauthorized,
 *     which App.tsx uses to drop straight to LoginScreen with an explanation.
 *  2. No timeout. A hung connection (very common on a phone that has "signal" but no
 *     working data) spun the button forever with no way to cancel.
 *  3. No offline distinction. A failed fetch while genuinely offline is a different
 *     message and a different fix from a 500, but both read identically to the driver.
 */

import { SERVER_ERROR_MESSAGE } from "./apiErrors";

export interface ApiError {
  code: string;
  message: string;
  /** True when the request never left the device -- caller can offer "retry when back online". */
  offline?: boolean;
  status?: number;
  pending?: string[];
  failedTypes?: string[];
}

/** Uploads carry photos over mobile data, so they get a much longer ceiling. */
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** App.tsx registers this once at mount. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function apiError(code: string, message: string, extra: Partial<ApiError> = {}): ApiError {
  return { code, message, ...extra };
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Skip the onUnauthorized callback -- used by the session check, where a 401 just
   *  means "not logged in yet" rather than "your session died". */
  allowUnauthorized?: boolean;
  timeoutMs?: number;
  /** Fires 0..1 as the request body uploads. Only honoured for FormData bodies, since
   *  fetch() cannot report upload progress -- those requests go via XMLHttpRequest. */
  onUploadProgress?: (fraction: number) => void;
}

/**
 * FormData path. fetch() has no upload-progress event, so photo uploads (which can be
 * the slowest thing a driver does all day) go through XHR to get a real progress bar
 * instead of an indefinite spinner.
 */
function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  timeoutMs: number
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = false; // same-origin cookies are sent by default
    xhr.timeout = timeoutMs;

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      onProgress(1);
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () =>
      reject(
        apiError(
          isOffline() ? "OFFLINE" : "NETWORK",
          isOffline() ? "You're offline. This will send when you're back on signal." : "Network problem. Check your signal and try again.",
          { offline: true }
        )
      );
    xhr.ontimeout = () =>
      reject(apiError("TIMEOUT", "That took too long. Check your signal and try again.", { offline: true }));

    xhr.send(form);
  });
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { allowUnauthorized, timeoutMs, onUploadProgress, ...init } = options;
  const isFormData = init.body instanceof FormData;
  const limit = timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  // Fail fast and honestly rather than waiting out a 20s timeout we know will fail.
  if (isOffline()) {
    throw apiError("OFFLINE", "You're offline. Reconnect and try again.", { offline: true });
  }

  let status: number;
  let body: any;

  if (isFormData && onUploadProgress) {
    const result = await uploadWithProgress(url, init.body as FormData, onUploadProgress, limit);
    status = result.status;
    body = result.body;
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    let res: Response;
    try {
      res = await fetch(url, { credentials: "same-origin", ...init, signal: controller.signal });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw apiError("TIMEOUT", "That took too long. Check your signal and try again.", { offline: true });
      }
      throw apiError(
        isOffline() ? "OFFLINE" : "NETWORK",
        isOffline()
          ? "You're offline. Reconnect and try again."
          : "Network problem. Check your signal and try again.",
        { offline: true }
      );
    } finally {
      clearTimeout(timer);
    }
    status = res.status;
    body = await parseJson(res);
  }

  if (status === 401 && !allowUnauthorized) {
    onUnauthorized?.();
    throw apiError("UNAUTHORIZED", "Your session expired. Sign in again.", { status });
  }

  if (status < 200 || status >= 300) {
    const server = body?.error;
    // A 5xx is our own infrastructure failing, not anything the driver did -- whatever
    // terse message the backend attached ("Failed to fetch jobs list.") isn't as
    // reassuring or actionable as just saying so plainly. A 4xx keeps the backend's
    // specific reason, same as before.
    const message = status >= 500 ? SERVER_ERROR_MESSAGE : server?.message ?? "Something went wrong. Try again.";
    throw apiError(status >= 500 ? "SERVER_ERROR" : server?.code ?? "UNKNOWN", message, {
      status,
      pending: server?.pending,
      failedTypes: server?.failedTypes
    });
  }

  return body as T;
}

/** Convenience for the common JSON POST. */
export function postJson<T>(url: string, payload: unknown, options: RequestOptions = {}): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...options
  });
}
