import { beforeEach, describe, expect, it, vi } from "vitest";
const lookup = vi.fn();
const read = vi.fn();
const insert = vi.fn();
const activity = vi.fn();
const invalidate = vi.fn();
vi.mock("../src/jobs/jobs.service", () => ({ getJobForDriver: (...args: unknown[]) => lookup(...args) }));
vi.mock("../src/db/driver-job-summary.repo", () => ({ getDriverJobSummary: (...args: unknown[]) => read(...args), insertDriverJobSummary: (...args: unknown[]) => insert(...args) }));
vi.mock("../src/db/activity.repo", () => ({ appendActivity: (...args: unknown[]) => activity(...args) }));
vi.mock("../src/admin/dashboard/dataset-cache", () => ({ invalidateDashboardDataset: () => invalidate() }));
import { submitDriverJobSummary } from "../src/jobs/driver-job-summary.service";

const body = () => ({ schemaVersion: 2, startTime: "2026-10-09T09:00:00Z", endTime: "2026-10-09T11:30:00Z",
  helperName: "", helperHours: "", noPaymentReceived: false, paymentMethods: ["Cash", "Card", "Invoice"],
  paymentAmounts: { Cash: "100.10", Card: "50.20", Invoice: "49.70" },
  chargeItems: [{ type: "congestion", amount: "18" }, { type: "tunnel", amount: "13.60", name: "Tunnel", reference: "event-1" }]
});
describe("Locked per-job Manual details", () => {
  it("saves hours and snapshots job-flow split payments and fees without asking for them again", async () => {
    lookup.mockResolvedValue({ job: { status: "COMPLETED", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z",
      amountCharged: 200, totalCharges: 200, paymentMethod: "Cash, Card, Invoice", paymentStatus: "Outstanding",
      paymentBreakdown: [{ method: "Cash", amount: 100.10 }, { method: "Card", amount: 50.20 }, { method: "Invoice", amount: 0 }],
      extraCharges: ["London Congestion charge", "Tunnel Charges"], chargeSnapshot: { congestionPence: 1800, tunnelPence: 1360 } },
      driver: { email: "driver@example.com", initials: "AB" } });
    const result = await submitDriverJobSummary("JOB", "driver@example.com", { schemaVersion: 3, driverJobHours: "3.5", helperHours: "2.5" });
    expect(result).toMatchObject({ schemaVersion: 3, driverJobHours: 3.5, helperHours: 2.5, helperName: "", amountCollectedPence: 15030, invoiceAmountPence: 4970,
      chargeItems: [{ type: "congestion", amountPence: 1800 }, { type: "tunnel", amountPence: 1360 }] });
    read.mockResolvedValue(result);
    expect(await submitDriverJobSummary("JOB", "driver@example.com", { schemaVersion: 3, driverJobHours: "3.5", helperHours: "2.5" })).toBe(result);
    await expect(submitDriverJobSummary("JOB", "driver@example.com", { schemaVersion: 3, driverJobHours: "4", helperHours: "2.5" })).rejects.toThrow("locked");
  });
  it.each(["", "1.5", "14.5", "3.25", "NaN"])("rejects driver hours outside dropdown choices: %s", async hours => {
    await expect(submitDriverJobSummary("JOB", "driver@example.com", { schemaVersion: 3, driverJobHours: hours, helperHours: "" })).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it("accepts no helper and preserves missing job-flow receipts as unverified", async () => {
    lookup.mockResolvedValueOnce({ job: { status: "COMPLETED", bookedStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z",
      paymentMethod: "Cash", paymentStatus: "Recorded", amountCharged: 100, extraCharges: [] }, driver: { email: "driver@example.com", initials: "AB" } });
    const result = await submitDriverJobSummary("JOB", "driver@example.com", { schemaVersion: 3, driverJobHours: "2", helperHours: "" });
    expect(result.helperHours).toBe(0);
    expect(result.noPaymentReceived).toBe(false);
    expect(result.paymentVerificationIssues).not.toHaveLength(0);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue({ job: { jobId: "JOB", status: "COMPLETED" }, driver: { email: "driver@example.com", initials: "AB" } });
    read.mockResolvedValue(null);
    insert.mockImplementation(async summary => ({ ...summary, createdAt: new Date() }));
    activity.mockResolvedValue(undefined);
  });
  it("sums received split payments once, excluding invoices and itemized fee components", async () => {
    const result = await submitDriverJobSummary("JOB", "driver@example.com", body());
    expect(result).toMatchObject({ schemaVersion: 2, jobId: "JOB", driverInitials: "AB", amountCollectedPence: 15030,
      invoiceAmountPence: 4970, helperName: "", helperHours: 0, congestionChargePence: 1800 });
    expect(result.chargeItems).toHaveLength(2);
    expect(invalidate).toHaveBeenCalledOnce();
  });
  it("allows a zero-collection submission with no helper", async () => {
    const result = await submitDriverJobSummary("JOB", "driver@example.com", { ...body(), noPaymentReceived: true, paymentMethods: [], paymentAmounts: {}, chargeItems: [] });
    expect(result.amountCollectedPence).toBe(0);
    expect(result.noPaymentReceived).toBe(true);
  });
  it("preserves unknown optional charge amounts", async () => {
    const result = await submitDriverJobSummary("JOB", "driver@example.com", { ...body(), chargeItems: [{ type: "tunnel", amount: "" }] });
    expect(result.chargeItems?.[0].amountPence).toBeNull();
  });
  it("returns the same immutable record on an identical retry, including method reordering", async () => {
    const first = await submitDriverJobSummary("JOB", "driver@example.com", body());
    read.mockResolvedValue(first);
    const retry = await submitDriverJobSummary("JOB", "driver@example.com", { ...body(), paymentMethods: ["Invoice", "Card", "Cash"] });
    expect(retry).toBe(first);
    expect(insert).toHaveBeenCalledOnce();
  });
  it("rejects a changed retry after locking", async () => {
    const first = await submitDriverJobSummary("JOB", "driver@example.com", body());
    read.mockResolvedValue(first);
    await expect(submitDriverJobSummary("JOB", "driver@example.com", { ...body(), helperName: "Changed" })).rejects.toThrow("locked");
    expect(insert).toHaveBeenCalledOnce();
  });
  it("handles a concurrent duplicate-key winner as an identical retry", async () => {
    const first = await submitDriverJobSummary("JOB", "driver@example.com", body());
    read.mockResolvedValueOnce(null).mockResolvedValueOnce(first);
    insert.mockRejectedValueOnce({ code: 11000 });
    expect(await submitDriverJobSummary("JOB", "driver@example.com", body())).toBe(first);
  });
  it("rejects a different duplicate-key winner", async () => {
    const first = await submitDriverJobSummary("JOB", "driver@example.com", body());
    read.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...first, helperName: "Different" });
    insert.mockRejectedValueOnce({ code: 11000 });
    await expect(submitDriverJobSummary("JOB", "driver@example.com", body())).rejects.toThrow("locked");
  });
  it("serializes simultaneous taps into one insert", async () => {
    let stored: unknown = null;
    read.mockImplementation(async () => stored);
    insert.mockImplementation(async summary => stored = { ...summary, createdAt: new Date() });
    const [a, b] = await Promise.all([submitDriverJobSummary("JOB", "driver@example.com", body()), submitDriverJobSummary("JOB", "driver@example.com", body())]);
    expect(a).toBe(b);
    expect(insert).toHaveBeenCalledOnce();
  });
  it("returns the saved record even if the activity log fails", async () => {
    activity.mockRejectedValueOnce(new Error("audit unavailable"));
    expect((await submitDriverJobSummary("JOB", "driver@example.com", body())).jobId).toBe("JOB");
  });
  it("requires completion and driver ownership", async () => {
    lookup.mockResolvedValueOnce({ job: { status: "IN_PROGRESS" }, driver: {} });
    await expect(submitDriverJobSummary("JOB", "driver@example.com", body())).rejects.toThrow("Complete this job");
    lookup.mockRejectedValueOnce(new Error("assigned to another driver"));
    await expect(submitDriverJobSummary("JOB", "other@example.com", body())).rejects.toThrow("another driver");
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([
    { paymentMethods: ["Cash", "Cash"] }, { paymentMethods: ["Crypto"] }, { paymentMethods: ["Invoice/Transfer"] },
    { paymentAmounts: { Cash: "NaN", Card: "0", Invoice: "0" } },
    { paymentAmounts: { Cash: "1.005", Card: "0", Invoice: "0" } },
    { paymentAmounts: { Cash: true, Card: "0", Invoice: "0" } },
    { paymentAmounts: { Cash: "99999999999999", Card: "0", Invoice: "0" } },
    { startTime: "2026-10-09T09:00:00" }, { endTime: "2026-02-30T10:00:00Z" },
    { endTime: "2026-10-09T08:00:00Z" }, { endTime: "2026-10-20T10:00:00Z" },
    { noPaymentReceived: "false" }, { noPaymentReceived: true }, { helperName: "", helperHours: "2" },
    { helperHours: false }, { helperHours: "-1" }, { helperName: "a".repeat(161) },
    { congestionCharge: "false" }, { schemaVersion: 99 },
    { chargeItems: [{ type: "parking", amount: "1" }] },
    { chargeItems: [{ type: "tunnel", amount: "-1" }] },
    { chargeItems: [{ type: "congestion", amount: "1" }, { type: "congestion", amount: "1" }] },
    { chargeItems: [{ type: "tunnel", amount: "1", reference: "x" }, { type: "tunnel", amount: "1", reference: "x" }] }
  ])("rejects malformed fields: %j", async changes => {
    await expect(submitDriverJobSummary("JOB", "driver@example.com", { ...body(), ...changes })).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
