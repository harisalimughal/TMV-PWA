import { beforeEach, describe, expect, it, vi } from "vitest";
const request = vi.fn();
const getRun = vi.fn();
const saveRun = vi.fn();
const events = vi.fn();
vi.mock("../src/gps/gps.provider", () => ({ fetchGpsHistorySlice: (...args: unknown[]) => request(...args) }));
vi.mock("../src/integrations/gpslive", () => ({ fetchGpsLiveZones: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/gps/gps.repo", () => ({ getGpsRun: (...args: unknown[]) => getRun(...args), saveGpsRun: (...args: unknown[]) => saveRun(...args),
  saveGpsEvents: (...args: unknown[]) => events(...args), saveGpsPositions: vi.fn().mockResolvedValue(undefined), saveGpsDrives: vi.fn().mockResolvedValue(undefined) }));
import { gpsRange, syncGpsHistory } from "../src/gps/gps.sync";

const from = "2026-10-07T09:00:00Z", to = "2026-10-07T11:00:00Z";
const empty = (source: string) => source === "trips" ? { routes: [], drives: [], events: [] } : [];

describe("Bounded resumable GPS history", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    getRun.mockResolvedValue(null);
    saveRun.mockResolvedValue(undefined);
    events.mockResolvedValue(undefined);
    request.mockImplementation(async source => empty(source));
  });
  it("queries all supported sources while never claiming provider completeness", async () => {
    const run = await syncGpsHistory("123", from, to);
    expect(run).toMatchObject({ status: "queried", providerCoverage: "unknown", requests: 3 });
    expect(run.intervals).toHaveLength(3);
  });
  it("splits saturated alert slices and preserves stable event IDs", async () => {
    request.mockImplementation(async (source, _imei, a, b) => {
      if (source !== "alerts") return empty(source);
      if (Date.parse(b) - Date.parse(a) > 3_600_000) return Array.from({ length: 500 }, (_, id) => ({ event_id: String(id), type: "zone_in", dt_tracker: a }));
      return [{ event_id: "stable", type: "zone_in", dt_tracker: a, event_desc: "Dartford" }];
    });
    const run = await syncGpsHistory("123", from, to);
    expect(run.status).toBe("queried");
    expect(request.mock.calls.filter(call => call[0] === "alerts")).toHaveLength(3);
    expect(events.mock.calls.flatMap(call => call[0])).toHaveLength(2);
    expect(events.mock.calls[0][0][0]._id).toBe(events.mock.calls[1][0][0]._id);
  });
  it("resumes completed slices after the request budget is exhausted", async () => {
    const partial = await syncGpsHistory("123", from, to, 2);
    expect(partial.status).toBe("partial");
    getRun.mockResolvedValue(partial);
    request.mockClear();
    const resumed = await syncGpsHistory("123", from, to, 2);
    expect(resumed.status).toBe("queried");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("trips");
  });
  it("refreshes a previously successful range to recover late provider history", async () => {
    const first = await syncGpsHistory("123", from, to);
    getRun.mockResolvedValue(first); request.mockClear();
    await syncGpsHistory("123", from, to);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("records failed source coverage and continues independent queries", async () => {
    request.mockImplementation(async source => { if (source === "positions") throw new Error("Provider unavailable"); return empty(source); });
    const run = await syncGpsHistory("123", from, to);
    expect(run.status).toBe("partial");
    expect(run.intervals.find(row => row.source === "positions")?.status).toBe("failed");
    expect(run.intervals.find(row => row.source === "trips")?.status).toBe("queried");
  });
  it("marks an irreducible saturated response partial", async () => {
    request.mockImplementation(async source => source === "alerts" ? Array.from({ length: 500 }, (_, id) => ({ event_id: String(id), type: "zone_in", dt_tracker: from })) : empty(source));
    const run = await syncGpsHistory("123", from, "2026-10-07T09:00:30Z");
    expect(run.status).toBe("partial");
    expect(run.intervals[0].reason).toContain("Saturated");
  });
  it("rejects invalid/oversized ranges and device identities", async () => {
    expect(() => gpsRange("2026-10-07T09:00:00", to)).toThrow();
    await expect(syncGpsHistory("bad", from, to)).rejects.toThrow();
    await expect(syncGpsHistory("123", from, "2026-11-01T09:00:00Z")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps invalid alert, trip event and drive rows partial rather than inventing usable coverage", async () => {
    request.mockImplementation(async source => source === "alerts" ? [{ type: "zone_in", dt_tracker: "invalid", event_desc: "Congestion" }]
      : source === "trips" ? { routes: [], drives: [{ bad: true }], events: [{ bad: true }] } : []);
    const run = await syncGpsHistory("123", from, to);
    expect(run.status).toBe("partial"); expect(run.intervals.filter(row => row.status === "partial")).toHaveLength(2);
    getRun.mockResolvedValue(structuredClone(run)); request.mockImplementation(async source => empty(source)); request.mockClear();
    const recovered = await syncGpsHistory("123", from, to); expect(recovered.status).toBe("queried"); expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(row => row[0])).toEqual(["alerts", "trips"]);
  });
  it("refuses disabled imports before provider calls or checkpoint writes", async () => {
    vi.stubEnv("TMV_GPS_HISTORY_SYNC_ENABLED", "false");
    await expect(syncGpsHistory("123", from, to)).rejects.toThrow("paused"); expect(saveRun).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
  it("detects saturation of trip events even when position routes are empty", async () => {
    request.mockImplementation(async source => source === "trips" ? { routes: [], drives: [], events: Array.from({ length: 5000 }, (_, id) => ({ event_id: String(id), type: "zone_in", dt_tracker: from })) } : []);
    const run = await syncGpsHistory("123", from, "2026-10-07T09:00:30Z"); expect(run.status).toBe("partial"); expect(run.intervals.find(row => row.source === "trips")?.reason).toContain("Saturated");
  });
});
