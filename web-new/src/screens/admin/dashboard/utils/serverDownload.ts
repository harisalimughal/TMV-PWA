/**
 * Downloads a file the server generates (CSV exports) through adminFetch instead of
 * navigating the window to the URL. A navigation could not report failures: a 401
 * left the user on a raw error page instead of returning them to sign-in, and a 5xx
 * or timeout showed the browser's error screen in place of the dashboard.
 */
import { adminFetch } from "../../../../lib/adminTransport";

const DOWNLOAD_TIMEOUT_MS = 120_000;

export async function downloadServerFile(path: string, fallbackName: string, expectedType: string, signal?: AbortSignal): Promise<void> {
  const response = await adminFetch(path, { signal }, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || "The export could not be downloaded. Please retry.");
  }
  if (!(response.headers.get("content-type") || "").startsWith(expectedType)) throw new Error("The server did not return the expected file. Please retry.");
  const blob = await response.blob();
  if (signal?.aborted) return;
  const raw = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1];
  const extension = fallbackName.slice(fallbackName.lastIndexOf("."));
  // Only a plain file name with the expected extension is accepted from the server.
  const filename = raw && /^[a-zA-Z0-9_.-]+$/.test(raw) && raw.endsWith(extension) ? raw : fallbackName;
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

export const downloadServerCsv = (path: string, fallbackName: string, signal?: AbortSignal) => downloadServerFile(path, fallbackName, "text/csv", signal);
