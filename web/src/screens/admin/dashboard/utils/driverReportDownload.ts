import { reportApiRange } from "./reportNavigation";

export async function downloadDriverReport(initials: string, from: string, to: string, groupBy: string, format: "pdf" | "xlsx", signal?: AbortSignal): Promise<void> {
  const params = new URLSearchParams({ ...reportApiRange(from, to), groupBy });
  const response = await fetch(`/api/admin/driver-reports/${encodeURIComponent(initials)}/export.${format}?${params}`, { credentials: "same-origin", signal });
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
