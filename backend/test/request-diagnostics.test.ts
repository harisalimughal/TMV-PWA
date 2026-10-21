import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerIssueTracker } from "../src/observability/server-errors.middleware";
import { presentServerError } from "../src/observability/server-errors";
import { attachMongoDiagnostics } from "../src/observability/mongo-diagnostics";
import { operationForEndpoint, pageFromReferer, safeEndpoint, safeRequestFilters } from "../src/observability/request-diagnostics";
import { log, setErrorLogSink } from "../src/utils/logger";

const sink = vi.fn();
beforeEach(() => { sink.mockClear(); setErrorLogSink(sink); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { setErrorLogSink(() => {}); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const response = (statusCode = 200) => {
  const res = Object.assign(new EventEmitter(), { statusCode, writableFinished: false, setHeader: vi.fn(), getHeader: vi.fn(), json: (_body: unknown) => res });
  return res;
};
const record = (index = 0) => presentServerError(sink.mock.calls[index][0]);

describe("Request diagnostics", () => {
  it("redacts dynamic path values, tokens and queries while keeping route templates", () => {
    expect(safeEndpoint("/api/admin/drivers/private@example.com?password=private-secret")).toBe("/api/admin/drivers/:value");
    expect(safeEndpoint("/api/admin/drivers/:email")).toBe("/api/admin/drivers/:email");
    expect(safeEndpoint("/api/admin/driver-reports/:initials/export.:format")).toBe("/api/admin/driver-reports/:initials/export.:format");
    expect(safeEndpoint("/api/webhooks/gpslive/private-token")).toBe("/api/webhooks/gpslive/:value");
    expect(operationForEndpoint("/api/admin/activity/unread", "GET")).toBe("Unread activity count (background)");
    expect(safeEndpoint("https://private-host/api/jobs")).toBeUndefined();
  });
  it("stores only known page labels and selected date/pagination filters", () => {
    expect(pageFromReferer("https://example.invalid/admin?section=driverreport&reportTab=comparison&driver=TI&token=private-token", false)).toBe("Driver report / Comparison");
    expect(pageFromReferer("https://example.invalid/?section=private-password", false)).toBeUndefined();
    expect(safeRequestFilters({ from: "2026-10-21", to: "2026-10-21T23:00:00.000Z", detail: "display", page: "2", password: "private-password", email: "private@example.com", search: "private search", token: "private-token" }))
      .toEqual({ from: "2026-10-21", to: "2026-10-21T23:00:00.000Z", detail: "display", page: 2 });
  });
  it("correlates parallel Mongo commands to the correct request even when they finish outside its async context", () => {
    vi.stubEnv("APP_BUILD_ID", "7e2407f");
    const client = new EventEmitter(); attachMongoDiagnostics(client as any);
    let clock = 0;
    const tracker = createServerIssueTracker({ now: () => clock, slowRequestMs: 10000 });
    const first = response(), second = response();
    const start = (path: string, page: string, res: ReturnType<typeof response>, id: number, collection: string) => {
      const req = { path, method: "GET", baseUrl: "", route: undefined as any, query: { from: "2026-10-21", token: "private-token" }, get: () => `https://example.invalid/admin?section=${page}` };
      tracker(req as any, res as any, () => {
        req.baseUrl = path; req.route = { path: "/" }; res.json({});
        client.emit("commandStarted", { requestId: id, commandName: "find", command: { find: collection, filter: { password: "private-password" } } });
      });
      return req;
    };
    const firstReq = start("/api/admin/jobs", "jobs", first, 1, "jobs");
    start("/api/admin/notifications", "notifications", second, 2, "activity");
    clock = 3500; client.emit("commandSucceeded", { requestId: 1, reply: { customerEmail: "private@example.com" } });
    clock = 5000; client.emit("commandSucceeded", { requestId: 2 });
    // Express may restore mount fields before finish. Preserve the captured route.
    firstReq.baseUrl = "";
    clock = 10000; first.emit("finish"); second.emit("finish");
    expect(record()).toMatchObject({ endpoint: "/api/admin/jobs", method: "GET", page: "Jobs", buildId: "7e2407f", durationMs: 10000,
      filters: { from: "2026-10-21" }, timings: [{ name: "db.jobs.find", durationMs: 3500, maxMs: 3500, calls: 1, failed: 0, pending: 0 }] });
    expect(record(1).timings).toEqual([{ name: "db.activity.find", durationMs: 5000, maxMs: 5000, calls: 1, failed: 0, pending: 0 }]);
    expect(record().serverRunId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.setHeader).toHaveBeenCalledWith("X-Request-ID", record().requestId);
    expect(JSON.stringify([record(), record(1)])).not.toMatch(/private-password|private@example.com|private-token/);
  });
  it("records endpoint and failed database timing for an already logged error without a second 5xx entry", () => {
    const client = new EventEmitter(); attachMongoDiagnostics(client as any);
    let clock = 0; const res = response(500);
    const req = { path: "/api/admin/jobs/TMV-ABCDEF1234", baseUrl: "/api/admin/jobs", route: { path: "/:jobId" }, params: { jobId: "TMV-ABCDEF1234" }, method: "GET" };
    createServerIssueTracker({ now: () => clock })(req as any, res as any, () => {
      client.emit("commandStarted", { requestId: 1, commandName: "find", command: { find: "jobs" } });
      clock = 700; client.emit("commandFailed", { requestId: 1, failure: new Error("private failure") });
      log.error("jobs route failed", new Error("private exception"));
    });
    clock = 900; res.emit("finish");
    expect(sink).toHaveBeenCalledOnce();
    expect(record()).toMatchObject({ endpoint: "/api/admin/jobs/:jobId", jobId: "TMV-ABCDEF1234", method: "GET", durationMs: 700,
      timings: [{ name: "db.jobs.find", failed: 1, calls: 1, pending: 0, durationMs: 700 }] });
  });
  it("omits unsafe metadata instead of persisting arbitrary labels, queries or commands", () => {
    const row = presentServerError({ timestamp: new Date().toISOString(), message: "Error", fields: {
      endpoint: "/api/admin/drivers/private@example.com?password=private-password", method: "private-method", operation: "private-operation", page: "private-page",
      timings: [{ name: "db.private-collection.find", durationMs: 1, maxMs: 1, calls: 1, failed: 0, pending: 0 }],
      filters: { search: "private-search", token: "private-token" }, buildId: "private-build-password"
    } });
    expect(row.endpoint).toBe("/api/admin/drivers/:value");
    expect(JSON.stringify(row)).not.toContain("private");
  });
});
