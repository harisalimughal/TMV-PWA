import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ collection: vi.fn(), arrays: {} as Record<string, () => Promise<unknown[]>>, queries: [] as Array<{ collection: string; filter?: any; projection?: unknown; pipeline?: any[] }> }));
vi.mock("../src/db/mongo", () => ({ getDb: async () => ({ collection: mocks.collection }) }));
import { readGpsEventRange, readGpsMovementRange, readGpsRange } from "../src/gps/gps.repo";

beforeEach(() => {
  mocks.queries.length = 0;
  mocks.arrays = Object.fromEntries(["gps_events", "gps_positions", "gps_drives", "gps_sync_runs", "geometry"].map(name => [name, async () => []]));
  mocks.collection.mockImplementation((name: string) => ({
    find: (filter: unknown) => {
      const query = { collection: name, filter } as typeof mocks.queries[number]; mocks.queries.push(query);
      const cursor = { project: (projection: unknown) => { query.projection = projection; return cursor; },
        sort: () => cursor, limit: () => cursor, toArray: () => mocks.arrays[name]() };
      return cursor;
    },
    aggregate: (pipeline: any[]) => { mocks.queries.push({ collection: name, pipeline }); return { toArray: () => mocks.arrays.geometry() }; }
  }));
});

describe("Bounded GPS report reads", () => {
  it("bounds interactive movement to job periods with boundary samples and overlapping drives", async () => {
    await readGpsMovementRange(["TRACKER"], "2026-10-12T00:00:00Z", "2026-10-20T00:00:00Z", [{ from: "2026-10-15T12:00:00Z", to: "2026-10-15T14:00:00Z" }]);
    expect(mocks.queries.map(query => query.collection)).toEqual(["gps_positions", "gps_drives"]);
    expect(mocks.queries[0].filter).toMatchObject({ imei: { $in: ["TRACKER"] }, $or: [{ occurredAt: { $gte: "2026-10-15T11:58:00.000Z", $lte: "2026-10-15T14:02:00.000Z" } }] });
    expect(mocks.queries[1].filter.$or).toEqual([{ start: { $lt: "2026-10-15T14:00:00Z" }, end: { $gt: "2026-10-15T12:00:00Z" } }]);
  });
  it("loads road events without reading movement points or zone snapshots", async () => {
    mocks.arrays.gps_events = async () => [{ _id: "entry" }];
    expect(await readGpsEventRange(["TRACKER"], "FROM", "TO")).toEqual({ events: [{ _id: "entry" }], truncated: false });
    expect(mocks.queries.map(query => query.collection)).toEqual(["gps_events"]);
  });
  it("starts independent collection reads while positions are still pending", async () => {
    let release!: (rows: unknown[]) => void;
    mocks.arrays.gps_positions = vi.fn(() => new Promise(resolve => { release = resolve; }));
    mocks.arrays.gps_drives = vi.fn(async () => []);
    mocks.arrays.gps_sync_runs = vi.fn(async () => []);
    const result = readGpsRange(["TRACKER"], "FROM", "TO");
    await vi.waitFor(() => expect(mocks.arrays.gps_drives).toHaveBeenCalledOnce());
    expect(mocks.arrays.gps_sync_runs).toHaveBeenCalledOnce();
    release([]); await result;
  });
  it("preserves report geometry and uncertainty while excluding repeated bulky payloads", async () => {
    const zones = [{ zoneId: 1, zoneName: "Congestion", zoneVertices: [[51, 0], [52, 0], [52, 1]] }];
    mocks.arrays.gps_sync_runs = async () => [{ _id: "new", status: "partial" }, { _id: "geometry-run", status: "queried" }];
    mocks.arrays.geometry = async () => [{ _id: "geometry-run", zoneSnapshot: zones }];
    mocks.arrays.gps_positions = async () => [{ _id: "point", lat: 51, lng: 0, conflicting: true }];
    const result = await readGpsRange(["TRACKER"], "FROM", "TO", { forReport: true });
    expect(result.runs).toEqual([{ _id: "new", status: "partial", zoneSnapshot: [] }, { _id: "geometry-run", status: "queried", zoneSnapshot: zones }]);
    expect(result.positions[0]).toMatchObject({ conflicting: true, lat: 51 });
    expect(mocks.queries.find(row => row.collection === "gps_positions")!.projection).toMatchObject({ conflicting: 1, ignitionOn: 1, lat: 1, lng: 1, occurredAt: 1 });
    expect(mocks.queries.find(row => row.collection === "gps_sync_runs" && !row.pipeline)!.projection).toEqual({ zoneSnapshot: 0, intervals: 0 });
    const pipeline = mocks.queries.find(row => row.pipeline)!.pipeline!;
    expect(pipeline.findIndex(stage => stage.$limit === 100)).toBeLessThan(pipeline.findIndex(stage => stage.$match?.["zoneSnapshot.0"]));
  });
  it("keeps the original complete metadata for monitoring callers", async () => {
    const run = { _id: "run", zoneSnapshot: [], intervals: [{ status: "partial" }], status: "partial" };
    mocks.arrays.gps_sync_runs = async () => [run];
    const result = await readGpsRange(["TRACKER"], "FROM", "TO");
    expect(result.runs).toEqual([run]);
    expect(mocks.queries.every(row => !row.projection && !row.pipeline)).toBe(true);
  });
  it("retains point limits and reports saturated run history as truncated", async () => {
    mocks.arrays.gps_positions = async () => Array.from({ length: 20_001 }, (_, index) => ({ _id: String(index) }));
    mocks.arrays.gps_sync_runs = async () => Array.from({ length: 100 }, (_, index) => ({ _id: String(index), status: "queried" }));
    const result = await readGpsRange(["TRACKER"], "FROM", "TO", { forReport: true });
    expect(result.positions).toHaveLength(20_000); expect(result.runs).toHaveLength(100); expect(result.truncated).toBe(true);
  });
});
