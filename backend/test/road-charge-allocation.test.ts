import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoadObligation } from "../src/gps/road-charge.rules";
const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ getDb: mock.getDb }));
import { mergeRoadAllocation, readRoadAllocations, reserveRoadObligation, saveAuthorityReferences } from "../src/gps/road-charge.repo";

const obligation = (changes: Partial<RoadObligation> = {}): RoadObligation => ({ id: "physical-one", jobId: "A", driverInitials: "AB", imei: "123", type: "tunnel", scheme: "dartford", occurredAt: "2026-10-09T10:01:00Z", londonDate: "2026-10-09", proofFrom: "2026-10-09T10:00:00Z", proofTo: "2026-10-09T10:01:00Z", visitIds: ["one"], expectedPence: 1360, tariff: null, tunnelName: "Fixture", direction: "A to B", authorityKey: "authority-one", authorityExpectedPence: null, authorityIssue: "Unverified", ...changes });

describe("Durable road allocation CAS", () => {
  let docs: Map<string, any>;
  let authority: Map<string, any>;
  let replaceOne: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    docs = new Map(); authority = new Map();
    replaceOne = vi.fn(async (filter, row, options) => {
      const prior = docs.get(filter._id);
      if (prior && options.upsert) throw Object.assign(new Error("Duplicate _id"), { code: 11000 });
      if (prior && prior.revision !== filter.revision) return { modifiedCount: 0, upsertedCount: 0 };
      docs.set(filter._id, structuredClone(row));
      return { modifiedCount: prior ? 1 : 0, upsertedCount: prior ? 0 : 1 };
    });
    const collection = { findOne: vi.fn(async (filter) => structuredClone(docs.get(filter._id) ?? null)), replaceOne,
      find: vi.fn((filter) => ({ toArray: async () => [...docs.values()].filter(doc => doc.rows.some((row: RoadObligation) => row.jobId === filter["rows.jobId"])) })) };
    mock.getDb.mockResolvedValue({ collection: (name: string) => name === "road_charge_allocations" ? collection : {
      updateOne: vi.fn(async (filter, update) => {
        const current = authority.get(filter._id) ?? { ...update.$setOnInsert, jobIds: [] };
        current.jobIds = [...new Set([...current.jobIds, update.$addToSet.jobIds])];
        authority.set(filter._id, current);
      })
    } });
  });
  it("serializes concurrent competing jobs and never creates two owners of one crossing", async () => {
    const results = await Promise.all([reserveRoadObligation(obligation()), reserveRoadObligation(obligation({ jobId: "B", driverInitials: "CD" }))]);
    expect(results.filter(row => row?.code === "Duplicate allocation")).toHaveLength(1);
    expect([...docs.values()].flatMap(doc => doc.rows)).toHaveLength(1);
  });
  it("deduplicates retries and overlapping enriched proofs, preserving the original price", async () => {
    await reserveRoadObligation(obligation());
    await reserveRoadObligation(obligation());
    await reserveRoadObligation(obligation({ id: "enriched", proofFrom: "2026-10-09T09:59:50Z", visitIds: ["enriched"] }));
    expect(await readRoadAllocations("A")).toMatchObject([{ id: "physical-one", expectedPence: 1360, visitIds: ["one", "enriched"] }]);
    expect(await reserveRoadObligation(obligation({ expectedPence: 1500 }))).toMatchObject({ code: "Needs verification" });
    expect((await readRoadAllocations("A"))[0].expectedPence).toBe(1360);
  });
  it("allows distinct crossings and distinct jobs' congestion fees for the same vehicle", async () => {
    await reserveRoadObligation(obligation());
    await reserveRoadObligation(obligation({ id: "next", proofFrom: "2026-10-09T11:00:00Z", proofTo: "2026-10-09T11:01:00Z" }));
    await reserveRoadObligation(obligation({ id: "cong-A", type: "congestion", scheme: "congestion" }));
    await reserveRoadObligation(obligation({ id: "cong-B", jobId: "B", type: "congestion", scheme: "congestion" }));
    expect([...docs.values()].flatMap(doc => doc.rows)).toHaveLength(4);
  });
  it("shares authority references without doubling customer allocations or inventing cost", async () => {
    await reserveRoadObligation(obligation());
    await reserveRoadObligation(obligation({ id: "enriched", proofFrom: "2026-10-09T09:59:50Z", authorityKey: "enriched-authority" }));
    await saveAuthorityReferences([obligation(), obligation({ id: "enriched", proofFrom: "2026-10-09T09:59:50Z", authorityKey: "enriched-authority" })]);
    expect(authority.size).toBe(1);
    await saveAuthorityReferences([obligation({ type: "congestion", jobId: "A", authorityKey: "daily" }), obligation({ type: "congestion", jobId: "B", authorityKey: "daily" })]);
    expect(authority.get("daily")).toMatchObject({ expectedPence: null, jobIds: ["A", "B"] });
  });
  it("fails safely when CAS contention persists", async () => {
    await reserveRoadObligation(obligation());
    replaceOne.mockResolvedValue({ modifiedCount: 0, upsertedCount: 0 });
    await expect(reserveRoadObligation(obligation({ id: "new", proofFrom: "2026-10-09T12:00:00Z", proofTo: "2026-10-09T12:01:00Z" }))).rejects.toThrow("Concurrent");
    expect((await readRoadAllocations("A"))).toHaveLength(1);
  });
  it("does not hide storage failures behind a successful result", async () => {
    replaceOne.mockRejectedValue(new Error("Database unavailable"));
    await expect(reserveRoadObligation(obligation())).rejects.toThrow("Database unavailable");
  });
  it("never merges two genuinely separate intervals", () => {
    const next = obligation({ id: "second", proofFrom: "2026-10-09T10:01:00Z", proofTo: "2026-10-09T10:02:00Z" });
    expect(mergeRoadAllocation([obligation()], next).rows).toHaveLength(2);
  });
});
