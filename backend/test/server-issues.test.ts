import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerIssueTracker } from "../src/observability/server-errors.middleware";
import { presentServerError, slowRequestThreshold } from "../src/observability/server-errors";
import { serverLogFilter } from "../src/observability/server-errors.repo";
import { setErrorLogSink } from "../src/utils/logger";

const sink = vi.fn();
beforeEach(() => { sink.mockClear(); setErrorLogSink(sink); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { setErrorLogSink(() => {}); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function request(options: { path?: string; method?: string; status?: number; duration?: number; cookies?: Record<string, string>; code?: string; close?: boolean; stream?: boolean; mutatePath?: boolean } = {}) {
  let clock = 0;
  const tracker = createServerIssueTracker({ now: () => clock, slowRequestMs: 10000 });
  const req = { path: options.path ?? "/api/jobs/TMV-ABCDEF1234", method: options.method ?? "GET", cookies: options.cookies, body: { password: "private-password", email: "private@example.com" } };
  const res = Object.assign(new EventEmitter(), { statusCode: options.status ?? 200, writableFinished: false, getHeader: () => options.stream ? "text/event-stream; charset=utf-8" : "application/json", json: (_body: unknown) => res });
  tracker(req as any, res as any, () => {
    if (options.mutatePath) req.path = "/";
    if (options.code) res.json({ error: { code: options.code, message: "private-response-message", token: "private-token" } });
    clock = options.duration ?? 0;
    if (!options.close) { res.writableFinished = true; res.emit("finish"); }
    res.emit("close");
  });
  return sink.mock.calls.map(([event]) => presentServerError(event));
}

describe("Selected access and performance issues", () => {
  it.each([
    [{ path: "/api/admin/login", method: "POST", status: 401 }, "Sign-in details were not accepted", "access"],
    [{ path: "/api/auth/login", method: "POST", status: 400 }, "Sign-in details were missing", "access"],
    [{ status: 401 }, "A request required sign-in", "access"],
    [{ status: 401, cookies: { tmv_driver_session: "private-cookie" } }, "A sign-in session is no longer valid", "access"],
    [{ status: 403 }, "An action was not permitted", "access"],
    [{ status: 429 }, "Too many requests or sign-in attempts", "access"],
    [{ status: 408 }, "A request timed out", "request_issue"],
    [{ status: 504 }, "A request timed out", "server_error"],
    [{ status: 404 }, "A requested item or service route was not found", "request_issue"],
    [{ status: 409 }, "An action conflicted with the current record", "request_issue"],
    [{ status: 413 }, "A file or request was too large", "request_issue"],
    [{ path: "/api/auth/complete-setup", status: 400, code: "INVALID_SETUP_LINK" }, "A sign-in setup or reset link was not accepted", "access"],
    [{ path: "/api/auth/reset-password", status: 400, code: "INVALID_RESET_LINK" }, "A sign-in setup or reset link was not accepted", "access"]
  ] as const)("records selected issue %j with accurate category", (options, title, kind) => {
    const rows = request({ ...options, duration: 1234 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title, kind, httpStatus: options.status, durationMs: 1234 });
    expect(JSON.stringify(rows)).not.toMatch(/private-password|private@example.com|private-cookie|private-token|private-response-message/);
  });
  it("ignores ordinary successes, ordinary validation, successful sign-in and signed-out session probes", () => {
    request(); request({ status: 400 }); request({ path: "/api/admin/login", method: "POST", status: 200 });
    request({ path: "/api/admin/me", status: 401 }); request({ path: "/api/auth/me", status: 401 });
    request({ path: "/api/admin/me", status: 401, cookies: { tmv_driver_session: "private-unrelated-session" } });
    request({ path: "/api/admin/logs", status: 500, duration: 30000 });
    expect(sink).not.toHaveBeenCalled();
  });
  it("records delay at the threshold and keeps the original operation area after routers change the path", () => {
    expect(request({ duration: 9999 })).toHaveLength(0);
    const rows = request({ path: "/api/admin/driver-reports/TI", duration: 10000, mutatePath: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "slow_request", area: "reports", httpStatus: 200, durationMs: 10000, audience: "Admin" });
    expect(rows[0].summary).toContain("not a failed request");
  });
  it("records unfinished connections without claiming their default 200 status was sent", () => {
    const rows = request({ duration: 30000, close: true });
    expect(rows[0]).toMatchObject({ kind: "request_issue", durationMs: 30000 });
    expect(rows[0]).not.toHaveProperty("httpStatus");
    expect(rows[0].summary).toContain("a server failure is not confirmed");
  });
  it("does not treat expected live streams as slow requests or interrupted errors", () => {
    request({ stream: true, duration: 60000 }); request({ stream: true, close: true, duration: 60000 });
    expect(sink).not.toHaveBeenCalled();
  });
  it("preserves older records without a kind when filtering server errors", () => {
    const filter = serverLogFilter("2026-10-21T00:00:00Z", "2026-10-22T00:00:00Z", "server_error");
    expect(filter.$or).toEqual([{ kind: "server_error" }, { kind: { $exists: false } }]);
    expect(serverLogFilter("2026-10-21", "2026-10-22", "access")).toHaveProperty("kind", "access");
  });
  it("validates the configurable slow threshold", () => {
    vi.stubEnv("ADMIN_LOG_SLOW_REQUEST_MS", "25000"); expect(slowRequestThreshold()).toBe(25000);
    vi.stubEnv("ADMIN_LOG_SLOW_REQUEST_MS", "0"); expect(slowRequestThreshold()).toBe(10000);
    vi.stubEnv("ADMIN_LOG_SLOW_REQUEST_MS", "bad"); expect(slowRequestThreshold()).toBe(10000);
  });
});
