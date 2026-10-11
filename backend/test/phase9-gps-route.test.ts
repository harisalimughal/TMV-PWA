import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: {} as Record<string, any>, sync: vi.fn() }));
vi.mock("express", () => ({ Router: () => ({ get: () => {}, post: (path: string, handler: any) => { mocks.handlers[path] = handler; } }) }));
vi.mock("../src/gps/gps.sync", () => ({ gpsRange: (from: string, to: string) => ({ from, to }), syncGpsHistory: mocks.sync }));
import { dashboardGpsRoutes } from "../src/admin/dashboard/gps.routes";
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
const body = { imei: "123", from: "2026-10-08T00:00:00Z", to: "2026-10-08T06:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("TMV_GPS_HISTORY_SYNC_ENABLED", "true"); mocks.sync.mockResolvedValue({ status: "queried", providerCoverage: "unknown" }); dashboardGpsRoutes(); });
afterEach(() => vi.unstubAllEnvs());
describe("Reviewed GPS import budget", () => {
  it("passes the proposal budget to the actual importer and preserves the existing default", async () => {
    await mocks.handlers["/sync"]({ body: { ...body, requestBudget: 18 } }, response()); expect(mocks.sync).toHaveBeenLastCalledWith("123", body.from, body.to, 18);
    await mocks.handlers["/sync"]({ body }, response()); expect(mocks.sync).toHaveBeenLastCalledWith("123", body.from, body.to, 128);
  });
  it("rejects oversized budgets and paused imports before invoking the importer", async () => {
    const invalid = response(); await mocks.handlers["/sync"]({ body: { ...body, requestBudget: 129 } }, invalid); expect(invalid.status).toHaveBeenCalledWith(400); expect(mocks.sync).not.toHaveBeenCalled();
    vi.stubEnv("TMV_GPS_HISTORY_SYNC_ENABLED", "false"); const paused = response(); await mocks.handlers["/sync"]({ body }, paused); expect(paused.status).toHaveBeenCalledWith(503); expect(mocks.sync).not.toHaveBeenCalled();
  });
});
