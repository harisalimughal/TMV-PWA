import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadDriverReport } from "./driverReportDownload";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Complete driver report downloads", () => {
  it("requests only date/driver/group scope, downloads a Blob and releases the object URL", async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValue(new Response("fake-pdf", { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tmv-demo.pdf"' } }));
    vi.stubGlobal("fetch", fetch);
    const create = vi.fn(() => "blob:sample"), revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await downloadDriverReport("AB", "2026-10-09", "2026-10-09", "week", "pdf");
    expect(fetch.mock.calls[0][0]).toContain("/AB/export.pdf?from=2026-10-09&to=2026-10-09&groupBy=week");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" }); expect(click).toHaveBeenCalledOnce(); expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers(); expect(revoke).toHaveBeenCalledWith("blob:sample");
  });
  it("shows server errors instead of downloading a JSON error as a spreadsheet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Narrow the range." } }), { status: 413 })));
    await expect(downloadDriverReport("AB", "2026-10-09", "2026-10-09", "day", "xlsx")).rejects.toThrow("Narrow the range.");
  });
  it("returns an expired session to sign-in instead of a vague failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const expired = vi.fn();
    window.addEventListener("tmv:admin-session-expired", expired);
    try {
      await expect(downloadDriverReport("AB", "2026-10-09", "2026-10-09", "day", "pdf")).rejects.toThrow("session expired");
      expect(expired).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("tmv:admin-session-expired", expired);
    }
  });
  it("gives up after the download timeout instead of spinning forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = expect(downloadDriverReport("AB", "2026-10-09", "2026-10-09", "day", "pdf")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(120_000);
    await pending;
  });
  it("refuses HTML sign-in responses masquerading as successful downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sign in", { headers: { "Content-Type": "text/html" } })));
    await expect(downloadDriverReport("AB", "2026-10-09", "2026-10-09", "day", "pdf")).rejects.toThrow("valid report");
  });
});
