import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ jobsCollection: vi.fn(), aggregate: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ jobsCollection: mocks.jobsCollection }));
import { listJobsInRange } from "../src/db/jobs.repo";
beforeEach(() => { vi.clearAllMocks(); mocks.aggregate.mockReturnValue({ toArray: async () => [] }); mocks.jobsCollection.mockResolvedValue({ aggregate: mocks.aggregate }); });
describe("Shared settlement/finance date ranges", () => {
  it("filters instants rather than lexicographic timezone-offset strings", async () => {
    await listJobsInRange("2026-10-09T00:00:00Z", "2026-10-10T00:00:00Z");
    const pipeline = mocks.aggregate.mock.calls[0][0];
    expect(JSON.stringify(pipeline[0])).toContain("$convert");
    expect(JSON.stringify(pipeline[0])).toContain("completion-fallback");
    expect(pipeline[1]).toEqual({ $match: { __effectiveStart: { $gte: new Date("2026-10-09T00:00:00Z"), $lte: new Date("2026-10-10T00:00:00Z") } } });
  });
  it("preserves existing inclusive weekly/date-only filters using London day boundaries", async () => {
    await listJobsInRange("2026-10-25", "2026-10-25");
    expect(mocks.aggregate.mock.calls[0][0][1]).toEqual({ $match: { __effectiveStart: { $gte: new Date("2026-10-24T23:00:00Z"), $lte: new Date("2026-10-25T23:59:59.999Z") } } });
  });
});
