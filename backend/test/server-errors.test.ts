import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorRecorder, presentServerError } from "../src/observability/server-errors";
import { trackServerErrors } from "../src/observability/server-errors.middleware";
import { currentRequestId, log, runWithContext, setErrorLogSink } from "../src/utils/logger";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); setErrorLogSink(() => {}); });
const event = () => ({ timestamp: "2026-10-21T10:00:00Z", message: "cloudinary upload failed with password=private-secret", requestId: "47b84121-a839-42d2-9160-dcc43250c0ea", jobId: "TMV-ABCDEF1234", fields: { email: "private@example.com", password: "private-secret", stack: "private-stack", error: "https://private-host/?token=private-token" } });

describe("Clean admin error history", () => {
  it("persists only fixed friendly text and validated references, never exceptions or payloads", () => {
    const record = presentServerError(event());
    expect(record).toMatchObject({ area: "uploads", title: "A photo or document operation failed", jobId: "TMV-ABCDEF1234" });
    for (const secret of ["private-secret", "private@example.com", "private-stack", "private-host", "private-token", "password"]) expect(JSON.stringify(record)).not.toContain(secret);
    expect(presentServerError({ ...event(), jobId: "private@example.com", requestId: "private-secret" })).not.toHaveProperty("jobId");
    expect(presentServerError({ ...event(), jobId: "private@example.com", requestId: "private-secret" })).not.toHaveProperty("requestId");
  });
  it("records errors only, preserves the original console log and isolates a broken sink", () => {
    const sink = vi.fn(); const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "log").mockImplementation(() => {});
    setErrorLogSink(sink);
    log.info("routine"); log.warn("warning"); log.error("operation failed", new Error("technical exception"));
    expect(sink).toHaveBeenCalledOnce(); expect(consoleError).toHaveBeenCalledOnce();
    setErrorLogSink(() => { throw new Error("sink down"); });
    expect(() => log.error("operation failed")).not.toThrow();
  });
  it("captures unlogged 5xx failures once, including nested request contexts, and excludes routine validation and the log reader", () => {
    const sink = vi.fn(); setErrorLogSink(sink); vi.spyOn(console, "error").mockImplementation(() => {});
    const request = (statusCode: number, path: string, logged = false) => {
      const response = Object.assign(new EventEmitter(), { statusCode, json: vi.fn(), getHeader: vi.fn() });
      trackServerErrors({ path } as any, response as any, () => {
        if (logged) { const id = currentRequestId(); runWithContext({ jobId: "TMV-ABCDEF1234" }, () => { expect(currentRequestId()).toBe(id); log.error("jobs route failed"); }); }
        response.emit("finish");
      });
    };
    request(500, "/api/admin/jobs"); expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0].fields.area).toBe("jobs");
    request(500, "/api/jobs/ABC", true); expect(sink).toHaveBeenCalledTimes(2);
    request(400, "/api/jobs"); request(200, "/api/jobs"); request(503, "/api/admin/logs");
    expect(sink).toHaveBeenCalledTimes(2);
  });
  it("does not wait for persistence and caps the pending queue during an outage", async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const write = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
    const recorder = createErrorRecorder(write, 2);
    recorder.record(event()); recorder.record(event()); recorder.record(event());
    expect(recorder.status()).toMatchObject({ pending: 2, omitted: 1 });
    const flushing = recorder.flush();
    expect(write).toHaveBeenCalledOnce();
    recorder.record(event());
    reject(new Error("database unavailable")); await flushing;
    expect(recorder.status()).toMatchObject({ pending: 1, failed: 2 });
    vi.clearAllTimers();
  });
});
