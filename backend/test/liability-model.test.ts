import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildLiabilityRecord, summarizeLiabilities, validateLiabilityHistory, type ApprovedLiabilityFinancialSource, type LiabilityStatusEvent } from "../src/liabilities/liability.model";
import type { ScenarioSubmissionDoc } from "../src/db/scenario.repo";
import type { Job } from "../src/jobs/job.types";

const job = { jobId: "JOB", driverInitials: "NEW" } as Job;
const source = (changes: Partial<ScenarioSubmissionDoc> = {}): ScenarioSubmissionDoc => ({ _id: "source-one", jobId: "JOB", scenario: "parking", driver: "old@example.com", fields: { client_name: "Customer", amount: "180", responsible_party: "driver" }, photoUrls: ["https://example.test/photo"], photoMeta: [{ capturedAt: "2026-10-09T09:00:00Z", locationName: "Pickup" }], signatureUrl: "https://example.test/signature", signatureMeta: { capturedAt: "2026-10-09T09:01:00Z" }, submittedAt: "2026-10-09T10:00:00+01:00", ...changes });
const finance = (changes: Partial<ApprovedLiabilityFinancialSource> = {}): ApprovedLiabilityFinancialSource => ({ origin: "approved-import", reference: "approved-one", approvedBy: "ops@example.com", approvedAt: "2026-10-09T11:00:00Z", amountPence: 6000, type: "fine", responsibleParty: "unknown", ...changes });
const event = (changes: Partial<LiabilityStatusEvent> = {}): LiabilityStatusEvent => ({ id: "event", from: "open", to: "paid", at: "2026-10-09T12:00:00Z", actor: "ops", note: "Confirmed by approved source", ...changes });

describe("Liability source projection", () => {
  it("keeps parking notices unknown and does not infer a fine or responsibility from form text", () => {
    expect(buildLiabilityRecord(source(), job)).toMatchObject({ amountPence: null, responsibleParty: "unknown", classification: "notice-or-risk-evidence", status: "open" });
  });
  it("does not assign a legacy incident to the job's current driver", () => {
    expect(buildLiabilityRecord(source(), job)?.driver).toMatchObject({ actor: "old@example.com", initials: null, provenance: "legacy-submitter" });
  });
  it("preserves the submission snapshot after reassignment or profile changes", () => {
    expect(buildLiabilityRecord(source({ driverSnapshot: { initials: "OLD", fullName: "Original", email: "old@example.com", imei: "123" } }), job)?.driver).toMatchObject({ initials: "OLD", name: "Original", vehicleImei: "123" });
  });
  it("links photos, capture metadata, signature, checkpoint and the real job deep link", () => {
    const record = buildLiabilityRecord(source({ fields: { reported_at: "Pickup - Street" } }), job)!;
    expect(record.photos[0]).toMatchObject({ url: "https://example.test/photo", meta: { locationName: "Pickup" } });
    expect(record.signature?.meta?.capturedAt).toBe("2026-10-09T09:01:00Z");
    expect(record.checkpoint).toBe("Pickup - Street");
    expect(record.jobDetailsUrl).toBe("/admin?section=jobs&job=JOB");
    expect(record.dateBasis).toBe("submission"); expect(record.incidentAt).toBeNull();
  });
  it("uses stable Mongo IDs, including ObjectIds, not the result-list index", () => {
    const first = buildLiabilityRecord(source({ _id: new ObjectId("507f1f77bcf86cd799439011") }), job)!;
    const second = buildLiabilityRecord(source({ _id: "507f1f77bcf86cd799439011", fields: { client_name: "Changed" } }), job)!;
    expect(first.id).toBe(second.id); expect(first.sourceHash).not.toBe(second.sourceHash);
  });
  it("uses order-independent legacy fingerprints and retains distinct incidents", () => {
    const a = buildLiabilityRecord(source({ _id: undefined, fields: { a: "a", b: "b" } }), job)!;
    expect(buildLiabilityRecord(source({ _id: undefined, fields: { b: "b", a: "a" } }), job)?.id).toBe(a.id);
    expect(buildLiabilityRecord(source({ _id: "different" }), job)?.id).not.toBe(a.id);
  });
  it("does not import standalone storage or another job's records", () => {
    expect(buildLiabilityRecord(source({ scenario: "checkin" }), job)).toBeNull();
    expect(buildLiabilityRecord(source({ jobId: "OTHER" }), job)).toBeNull();
  });
  it("does not turn risk categories into separate monetary incidents", () => {
    const record = buildLiabilityRecord(source({ scenario: "liability", fields: { damage_categories: "Walls | Van Overloaded" } }), job)!;
    expect(record.description).toBe("Walls | Van Overloaded"); expect(record.amountPence).toBeNull();
  });
  it("preserves invalid dates as unknown rather than substituting the clock", () => {
    expect(buildLiabilityRecord(source({ submittedAt: "2026-10-09 10:00:00" }), job)).toMatchObject({ date: null, reportedAt: null, dateBasis: "unknown" });
  });
  it("accepts explicit structured approval metadata, exact zero, and incident-time provenance", () => {
    const record = buildLiabilityRecord(source({ liabilityFinancial: finance({ amountPence: 0, incidentAt: "2026-10-08T09:00:00+01:00" }) }), job)!;
    expect(record).toMatchObject({ amountPence: 0, classification: "approved-financial-record", dateBasis: "approved-incident", incidentAt: "2026-10-08T08:00:00.000Z" });
  });
  it.each([-1, 1.2, NaN, 100_000_001])("rejects invalid approved monetary value %s without fabricating zero", amountPence => {
    expect(buildLiabilityRecord(source({ liabilityFinancial: finance({ amountPence }) }), job)?.amountPence).toBeNull();
  });
  it("rejects invalid approval identity and invalid status history", () => {
    expect(buildLiabilityRecord(source({ liabilityFinancial: finance({ approvedBy: "" }) }), job)?.amountPence).toBeNull();
    expect(buildLiabilityRecord(source({ liabilityFinancial: finance({ statusHistory: [event({ actor: "" })] }) }), job)?.status).toBe("open");
  });
});

describe("Approved liability status audit and totals", () => {
  it("supports dispute, payment, explicit reopening and resolution with ordered audit events", () => {
    expect(validateLiabilityHistory([event({ id: "dispute", to: "disputed" }), event({ id: "paid", from: "disputed", at: "2026-10-09T13:00:00Z" }), event({ id: "reopen", from: "paid", to: "open", at: "2026-10-09T14:00:00Z" }), event({ id: "resolve", to: "resolved", at: "2026-10-09T15:00:00Z" })]).status).toBe("resolved");
  });
  it("rejects unaudited, duplicate, out-of-order or silently changed terminal statuses", () => {
    expect(() => validateLiabilityHistory([event({ note: "" })])).toThrow();
    expect(() => validateLiabilityHistory([event(), event({ from: "paid", to: "open" })])).toThrow();
    expect(() => validateLiabilityHistory([event(), event({ id: "second", from: "paid", to: "waived" })])).toThrow();
    expect(() => validateLiabilityHistory([event(), event({ id: "second", from: "paid", to: "open", at: "2026-10-09T11:00:00Z" })])).toThrow();
  });
  it("keeps unknown totals incomplete, known amounts exact, and duplicates out of totals", () => {
    const unknown = buildLiabilityRecord(source(), job)!;
    const paid = buildLiabilityRecord(source({ _id: "paid", liabilityFinancial: finance({ statusHistory: [event()] }) }), job)!;
    const open = buildLiabilityRecord(source({ _id: "open", liabilityFinancial: finance({ reference: "open-source", amountPence: 1234 }) }), job)!;
    expect(summarizeLiabilities([unknown, paid, paid, open])).toMatchObject({ records: 3, unknownAmountCount: 1, knownTotalPence: 7234, completeTotalPence: null, knownUnresolvedPence: 1234, includedInCustomerCollections: false, includedInGpsCharges: false });
  });
  it("does not count the same approval reference twice across different scenario records", () => {
    const a = buildLiabilityRecord(source({ liabilityFinancial: finance() }), job)!;
    const b = buildLiabilityRecord(source({ _id: "copy", liabilityFinancial: finance() }), job)!;
    expect(summarizeLiabilities([a, b])).toMatchObject({ knownTotalPence: 6000, duplicateFinancialSourceCount: 1, unknownAmountCount: 0, completeTotalPence: null });
  });
  it("excludes conflicting amounts/statuses for one approval from known subtotals", () => {
    const a = buildLiabilityRecord(source({ liabilityFinancial: finance() }), job)!;
    const b = buildLiabilityRecord(source({ _id: "conflicting", liabilityFinancial: finance({ amountPence: 7000 }) }), job)!;
    expect(summarizeLiabilities([a, b])).toMatchObject({ knownTotalPence: 0, conflictingFinancialSourceCount: 1, completeTotalPence: null });
  });
});
