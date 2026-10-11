import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioSubmissionDoc } from "../src/db/scenario.repo";
import type { Job } from "../src/jobs/job.types";
import { buildLiabilityRecord } from "../src/liabilities/liability.model";
const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ getDb: mock.getDb }));
import { persistLiability } from "../src/liabilities/liability.repo";
const source = { _id: "source", jobId: "JOB", scenario: "parking", driver: "AB", fields: {}, photoUrls: [], signatureUrl: "", submittedAt: "2026-10-09T10:00:00Z", liabilityFinancial: {
  origin: "approved-import", reference: "approved-one", approvedBy: "ops", approvedAt: "2026-10-09T11:00:00Z", amountPence: 6000, type: "parking", responsibleParty: "unknown"
} } as ScenarioSubmissionDoc;
const job = { jobId: "JOB" } as Job;
const record = () => buildLiabilityRecord(source, job)!;
describe("Import-only liability persistence", () => {
  let docs: Map<string, any>;
  let update: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    docs = new Map();
    update = vi.fn(async (filter, value) => {
      const prior = docs.get(filter._id);
      if (value.$setOnInsert) { if (!prior) docs.set(filter._id, structuredClone({ _id: filter._id, ...value.$setOnInsert })); return { modifiedCount: 0 }; }
      if (!prior || prior.record.sourceHash !== filter["record.sourceHash"]) return { modifiedCount: 0 };
      docs.set(filter._id, { ...prior, ...structuredClone(value.$set) }); return { modifiedCount: 1 };
    });
    mock.getDb.mockResolvedValue({ collection: () => ({ updateOne: update, findOne: async (filter: any) => structuredClone(docs.get(filter._id) ?? null) }) });
  });
  it("deduplicates concurrent/repeated imports with one immutable source snapshot", async () => {
    await Promise.all([persistLiability(record()), persistLiability(record())]);
    expect(docs.size).toBe(1);
    expect(await persistLiability(record())).toBe("inserted-or-identical");
  });
  it("flags changed amounts or source ownership without overwriting accepted data", async () => {
    await persistLiability(record());
    const changed = buildLiabilityRecord({ ...source, liabilityFinancial: { ...source.liabilityFinancial!, amountPence: 7000 } }, job)!;
    expect(await persistLiability(changed)).toBe("source-conflict");
    expect(docs.get(changed.id).record.amountPence).toBe(6000);
  });
  it("imports approved append-only status history, preserving amount and full audit events", async () => {
    await persistLiability(record());
    const next = buildLiabilityRecord({ ...source, liabilityFinancial: { ...source.liabilityFinancial!, statusHistory: [{ id: "paid", from: "open", to: "paid", at: "2026-10-09T12:00:00Z", actor: "ops", note: "Receipt verified" }] } }, job)!;
    expect(await persistLiability(next)).toBe("updated-approved-status");
    expect(docs.get(next.id).record).toMatchObject({ amountPence: 6000, status: "paid", statusHistory: [{ id: "paid" }] });
    expect(await persistLiability(record())).toBe("source-conflict");
  });
  it("does not swallow storage errors or falsely confirm an unowned source", async () => {
    update.mockRejectedValue(new Error("Unavailable"));
    await expect(persistLiability(record())).rejects.toThrow("Unavailable");
    update.mockRejectedValue(Object.assign(new Error("Duplicate financial reference"), { code: 11000 }));
    await expect(persistLiability(record())).rejects.toThrow("could not be confirmed");
  });
});
