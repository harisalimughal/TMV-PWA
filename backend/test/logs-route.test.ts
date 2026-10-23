import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../src/observability/server-errors.repo", () => ({ listServerErrors: mocks.list }));
import { dashboardLogsRoutes } from "../src/admin/dashboard/logs.routes";
import { requireAdminAuth } from "../src/auth/require-admin-auth";
import { setAdminSessionCookie } from "../src/auth/admin-session";
let server: Server, base: string, cookie: string;
const range = "from=2026-10-21&to=2026-10-21";
beforeAll(async () => {
  const app = express(); app.use(cookieParser());
  app.use("/api/admin/logs", requireAdminAuth, dashboardLogsRoutes());
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/logs`;
  setAdminSessionCookie({ cookie: (name: string, value: string) => { cookie = `${name}=${value}`; } } as any);
});
afterAll(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
beforeEach(() => { mocks.list.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, capture: { pending: 0, failed: 0, omitted: 0 } }); });

describe("Protected Logs API", () => {
  it.each(["", "tmv_admin_session=forged", "tmv_driver_session=driver-token"])("rejects non-admin access before reading history: %j", async value => {
    const res = await fetch(`${base}?${range}`, { headers: { Cookie: value } });
    expect(res.status).toBe(401); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("uses London days, exclusive end, pagination and issue filtering without caching", async () => {
    const res = await fetch(`${base}?${range}&kind=access&page=2&pageSize=25`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledWith("2026-10-20T23:00:00.000Z", "2026-10-21T23:00:00.000Z", 2, 25, "access");
  });
  it.each([`${range}&kind=invalid`, `${range}&page=0`, `${range}&pageSize=101`, "from=invalid&to=2026-10-21"])("rejects invalid filters: %s", async query => {
    const res = await fetch(`${base}?${query}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(400); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("reports unavailable storage without exposing technical details or false empty history", async () => {
    mocks.list.mockRejectedValue(new Error("private database credentials"));
    const res = await fetch(`${base}?${range}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { message: "Log history is temporarily unavailable. Try again shortly." } });
  });
});
