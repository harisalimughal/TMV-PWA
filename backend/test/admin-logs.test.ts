import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../src/observability/server-errors.repo", () => ({ listServerErrors: mocks.list }));
import { dashboardLogsRoutes } from "../src/admin/dashboard/logs.routes";
import { requireAdminAuth } from "../src/auth/require-admin-auth";
import { setAdminSessionCookie } from "../src/auth/admin-session";
import { adminRoutes } from "../src/auth/admin.routes";
import { trackServerErrors } from "../src/observability/server-errors.middleware";
import { setErrorLogSink } from "../src/utils/logger";

let server: Server, base: string, cookie: string;
let captured: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  mocks.list.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, capture: { pending: 0, omitted: 0, failed: 0 } });
  captured = vi.fn(); setErrorLogSink(captured);
  const app = express(); app.use(trackServerErrors); app.use(express.json()); app.use(cookieParser());
  app.use("/api/admin", adminRoutes());
  app.get("/test-session", (_req, res) => { setAdminSessionCookie(res); res.json({ ok: true }); });
  app.use("/api/admin/logs", requireAdminAuth, dashboardLogsRoutes());
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  const session = await fetch(base + "/test-session"); cookie = session.headers.get("set-cookie")!.split(";")[0];
});
afterEach(async () => { setErrorLogSink(() => {}); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

describe("Protected error history", () => {
  it("denies unauthenticated access before reading any log records", async () => {
    expect((await fetch(base + "/api/admin/logs?from=2026-10-21&to=2026-10-21")).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("filters whole London days across clock changes, with validated pagination and no browser caching", async () => {
    const response = await fetch(base + "/api/admin/logs?from=2026-10-24&to=2026-10-25&page=2", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.list).toHaveBeenCalledWith("2026-10-23T23:00:00.000Z", "2026-10-26T00:00:00.000Z", 2, 25, "all");
  });
  it.each(["from=bad&to=bad", "from=2026-10-21&to=2026-10-21&page=-1", "from=2026-10-21&to=2026-10-21&pageSize=101", "from=2026-10-22&to=2026-10-20", "from=2026-10-21&to=2026-10-21&kind=anything"])("rejects invalid filters: %s", async query => {
    expect((await fetch(`${base}/api/admin/logs?${query}`, { headers: { Cookie: cookie } })).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("filters by issue kind on the server", async () => {
    const response = await fetch(base + "/api/admin/logs?from=2026-10-21&to=2026-10-21&kind=access", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.any(String), expect.any(String), 1, 25, "access");
  });
  it("captures a real failed admin sign-in without changing its response or recording the password", async () => {
    const response = await fetch(base + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "private-wrong-password" }) });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("INVALID_CREDENTIALS");
    expect(captured).toHaveBeenCalledOnce();
    expect(captured.mock.calls[0][0].fields).toMatchObject({ issueType: "login_failed", httpStatus: 401, audience: "Admin" });
    expect(JSON.stringify(captured.mock.calls)).not.toContain("private-wrong-password");
  });
  it("ignores a normal signed-out session check but records an invalid existing session", async () => {
    expect((await fetch(base + "/api/admin/me")).status).toBe(401);
    expect(captured).not.toHaveBeenCalled();
    expect((await fetch(base + "/api/admin/me", { headers: { Cookie: "tmv_admin_session=private-invalid-cookie" } })).status).toBe(401);
    expect(captured).toHaveBeenCalledOnce();
    expect(captured.mock.calls[0][0].fields.issueType).toBe("session_invalid");
    expect(JSON.stringify(captured.mock.calls)).not.toContain("private-invalid-cookie");
  });
  it("shows unavailable rather than pretending there were no errors if storage fails", async () => {
    mocks.list.mockRejectedValue(new Error("mongodb://private-credentials"));
    const response = await fetch(base + "/api/admin/logs?from=2026-10-21&to=2026-10-21", { headers: { Cookie: cookie } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-credentials");
  });
});
