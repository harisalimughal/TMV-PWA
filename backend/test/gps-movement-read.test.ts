import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ collection: vi.fn(), find: vi.fn(), project: vi.fn(), sort: vi.fn(), limit: vi.fn(), toArray: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ getDb: async () => ({ collection: mocks.collection }) }));
import { readGpsMovementRange } from "../src/gps/gps.repo";
beforeEach(() => {
  vi.clearAllMocks();
  const cursor = { project: mocks.project, sort: mocks.sort, limit: mocks.limit, toArray: mocks.toArray };
  mocks.project.mockReturnValue(cursor); mocks.sort.mockReturnValue(cursor); mocks.limit.mockReturnValue(cursor);
  mocks.find.mockReturnValue(cursor); mocks.collection.mockReturnValue({ find: mocks.find });
});
describe("Minimal GPS movement reads", () => {
  it("reads only positions and drives, omitting bulky event/raw payloads and sync runs", async () => {
    mocks.toArray.mockResolvedValueOnce([{ _id: "position" }]).mockResolvedValueOnce([{ _id: "drive" }]);
    const result = await readGpsMovementRange(["IMEI"], "FROM", "TO");
    expect(mocks.collection.mock.calls.map(call => call[0])).toEqual(["gps_positions", "gps_drives"]);
    expect(mocks.find).toHaveBeenCalledTimes(2);
    expect(mocks.project.mock.calls[0][0]).not.toHaveProperty("raw");
    expect(result).toMatchObject({ positions: [{ _id: "position" }], drives: [{ _id: "drive" }], truncated: false });
  });
  it("retains the read limit and makes truncation explicit", async () => {
    mocks.toArray.mockResolvedValueOnce(Array.from({ length: 20_001 }, (_, index) => ({ _id: String(index) }))).mockResolvedValueOnce([]);
    const result = await readGpsMovementRange(["IMEI"], "FROM", "TO");
    expect(result.positions).toHaveLength(20_000); expect(result.truncated).toBe(true);
    expect(mocks.limit).toHaveBeenCalledWith(20_001);
  });
});
