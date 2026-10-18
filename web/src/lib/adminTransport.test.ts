import { afterEach, describe, expect, it, vi } from "vitest";
import { adminFetch, ADMIN_SESSION_EXPIRED } from "./adminTransport";
import { setIncludeMA } from "./adminDriverScope";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("admin transport", () => {
  it("includes MA in other pages and broadcasts' driver roster even when Overview excludes MA", async () => {
    setIncludeMA(false);
    const fetch = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetch);
    for (const path of ["/api/admin/jobs", "/api/admin/drivers", "/api/admin/notifications", "/api/admin/fleet/live", "/api/admin/driver-reports/MA"]) await adminFetch(path);
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const [, init] of fetch.mock.calls) expect(init.headers["X-TMV-Include-MA"]).toBe("true");
  });
  it("preserves credentials, body and method", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetch);
    await adminFetch("/api/admin/jobs", { method: "POST", body: "payload" });
    expect(fetch).toHaveBeenCalledWith("/api/admin/jobs", expect.objectContaining({ credentials: "same-origin", method: "POST", body: "payload", signal: expect.any(AbortSignal) }));
  });
  it("announces expired sessions but not a rejected login or initial session check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 401 }))));
    const expired = vi.fn(); window.addEventListener(ADMIN_SESSION_EXPIRED, expired);
    try {
      await adminFetch("/api/admin/login"); await adminFetch("/api/admin/me");
      expect(expired).not.toHaveBeenCalled();
      await expect(adminFetch("/api/admin/jobs")).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      expect(expired).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(ADMIN_SESSION_EXPIRED, expired); }
  });
  it("does not turn a permission denial into logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    expect((await adminFetch("/api/admin/jobs")).status).toBe(403);
  });
  it("bounds a stalled request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    const result = expect(adminFetch("/api/admin/jobs", {}, 50)).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(51); await result;
  });
  it("preserves caller cancellation instead of reporting a server outage", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_path, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    const result = expect(adminFetch("/api/admin/jobs", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await result;
  });
});
