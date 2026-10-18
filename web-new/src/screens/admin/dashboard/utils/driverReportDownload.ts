import { adminFetch } from "../../../../lib/adminTransport";
import { reportApiRange } from "./reportNavigation";

/** Large PDF/XLSX exports can take a while to render; allow longer than the 30 s default. */
const REPORT_DOWNLOAD_TIMEOUT_MS = 120_000;

export async function downloadDriverReport(initials: string, from: string, to: string, groupBy: string, format: "pdf" | "xlsx", signal?: AbortSignal): Promise<void> {
  const params = new URLSearchParams({ ...reportApiRange(from, to), groupBy });
  // adminFetch: same-origin cookies, a bounded wait, and a 401 returns the admin to sign-in.
  const response = await adminFetch(`/api/admin/driver-reports/${encodeURIComponent(initials)}/export.${format}?${params}`, { signal }, REPORT_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || (response.status === 401 ? "Your admin session has expired. Please sign in again." : "Report download failed. Please retry."));
  }
  const expected = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!response.headers.get("content-type")?.startsWith(expected)) throw new Error("The server did not return a valid report. Please sign in again or retry.");
  const blob = await response.blob();
  if (signal?.aborted) return;
  const raw = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1];
  const filename = raw && /^[a-zA-Z0-9_.-]+$/.test(raw) && raw.endsWith(`.${format}`) ? raw : `tmv-driver-report.${format}`;
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
