import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), project: vi.fn(), sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), maxTime: vi.fn(), rows: [] as any[] }));
vi.mock("../src/db/mongo", () => ({ getDb: async () => ({ collection: () => ({ find: mocks.find, countDocuments: mocks.count }) }) }));
import { listServerErrors } from "../src/observability/server-errors.repo";
beforeEach(() => {
  vi.clearAllMocks();
  let projection: Record<string, number> = {};
  const cursor: any = { project: mocks.project, sort: mocks.sort, skip: mocks.skip, limit: mocks.limit, maxTimeMS: mocks.maxTime,
    toArray: async () => mocks.rows.map(row => Object.fromEntries(Object.keys(projection).filter(key => key in row).map(key => [key, row[key]]))) };
  mocks.find.mockReturnValue(cursor); mocks.count.mockResolvedValue(1);
  mocks.project.mockImplementation(value => { projection = value; return cursor; });
  for (const method of [mocks.sort, mocks.skip, mocks.limit, mocks.maxTime]) method.mockReturnValue(cursor);
});
describe("Persisted log diagnostics API projection", () => {
  it("returns stored endpoint, filters and timings while excluding raw technical fields", async () => {
    mocks.rows = [{ _id: "ref", occurredAt: new Date("2026-10-21T10:00:00Z"), kind: "slow_request", method: "GET",
      endpoint: "/api/admin/jobs", operation: "Admin job list", page: "Jobs", buildId: "7e2407f", serverRunId: "run",
      requestStartedAt: "2026-10-21T09:59:45Z", filters: { pageSize: 25 }, timings: [{ name: "db.jobs.find", durationMs: 15000 }],
      rawError: "private-password", requestUrl: "https://private-host/?token=private-token" }];
    const result = await listServerErrors("2026-10-21T00:00:00Z", "2026-10-22T00:00:00Z", 2, 25);
    expect(result.items[0]).toMatchObject({ id: "ref", occurredAt: "2026-10-21T10:00:00.000Z", endpoint: "/api/admin/jobs", method: "GET", page: "Jobs", buildId: "7e2407f", filters: { pageSize: 25 }, timings: [{ name: "db.jobs.find" }] });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(mocks.project).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 1, method: 1, operation: 1, page: 1, timings: 1, filters: 1, requestStartedAt: 1, buildId: 1, serverRunId: 1 }));
    expect(mocks.skip).toHaveBeenCalledWith(25); expect(mocks.limit).toHaveBeenCalledWith(25); expect(mocks.maxTime).toHaveBeenCalledWith(10000);
  });
  it("keeps older records readable without inventing an endpoint", async () => {
    mocks.rows = [{ _id: "old", occurredAt: new Date("2026-10-21T10:00:00Z"), title: "Old issue" }];
    const result = await listServerErrors("2026-10-21T00:00:00Z", "2026-10-22T00:00:00Z", 1, 25);
    expect(result.items[0]).toMatchObject({ id: "old", kind: "server_error" });
    expect(result.items[0]).not.toHaveProperty("endpoint");
  });
});
