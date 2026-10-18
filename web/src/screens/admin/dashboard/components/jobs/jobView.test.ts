import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../types";
import { addressLines, attentionOf, isUnpriced, jobAccent, paymentLine, rowCharge } from "./jobView";

const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({ jobId: "J1", status: "READY", driverInitials: "TI", driverName: "Tiago", customerName: "Alex", ...patch } as NormalizedJob);

describe("jobAccent", () => {
  it("follows the backend status, never a timestamp", () => {
    expect(jobAccent(job({ status: "READY", actualFinish: "2026-10-16T10:00:00Z" }))).toMatchObject({ accent: "neutral", label: "Scheduled" });
    expect(jobAccent(job({ status: "IN_PROGRESS" }))).toMatchObject({ accent: "violet", label: "In progress" });
    expect(jobAccent(job({ status: "COMPLETED" }))).toMatchObject({ accent: "teal", label: "Completed" });
    expect(jobAccent(job({ status: "CANCELLED" }))).toMatchObject({ accent: "coral", label: "Cancelled" });
  });
  it("marks an active job with no driver amber, keeping its real status label", () => {
    expect(jobAccent(job({ driverInitials: "", driverName: "" }))).toMatchObject({ accent: "amber", label: "Scheduled" });
  });
});

describe("paymentLine", () => {
  it("keeps paid online, recorded methods and missing methods apart", () => {
    expect(paymentLine(job({ status: "COMPLETED", paymentMethod: "Card", paidOnline: true }))).toBe("Card · paid online");
    expect(paymentLine(job({ status: "COMPLETED", paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amount: 100 }] }))).toBe("Cash · receipt recorded");
    expect(paymentLine(job({ status: "COMPLETED", paymentMethod: "" }))).toBe("Payment method not recorded");
    expect(paymentLine(job({ status: "CANCELLED" }))).toBe("No charge recorded");
    // The backend's payment status is used as sent.
    expect(paymentLine(job({ status: "COMPLETED", paymentMethod: "Card, Cash", paymentStatus: "Recorded", paymentBreakdown: [] }))).toBe("Card, Cash · recorded");
    expect(paymentLine(job({ status: "COMPLETED", paymentMethod: "Invoice", paymentStatus: "Outstanding" }))).toBe("Invoice · outstanding");
  });
});

describe("attention and addresses", () => {
  it("reports the highest severity", () => {
    expect(attentionOf(job({ driverInitials: "", driverName: "" })).severity).toBe("high");
    expect(attentionOf(job({})).severity).toBeNull();
  });
  it("splits an address at its first comma", () => {
    expect(addressLines("1 Sample Road, KT6")).toEqual({ first: "1 Sample Road", rest: "KT6" });
    expect(addressLines("KT6")).toEqual({ first: "KT6", rest: "" });
  });
});

describe("isUnpriced", () => {
  it("reads a zero with no base price and no rate as unpriced, not as £0.00", () => {
    expect(isUnpriced(job({ totalCharges: 0, basePrice: 0 }))).toBe(true);
    expect(rowCharge(job({ totalCharges: 0, basePrice: 0 })).pence).toBeNull();
  });
  it("keeps a zero that has pricing evidence as a real £0.00", () => {
    const priced = job({ totalCharges: 0, basePrice: 0, timeBilling: { ratePer30Pence: 5500, rateSource: "calendar" } as NormalizedJob["timeBilling"] });
    expect(isUnpriced(priced)).toBe(false);
    expect(rowCharge(priced)).toEqual({ label: "Calculated", pence: 0 });
    expect(isUnpriced(job({ totalCharges: 0, basePrice: 18000 }))).toBe(false);
  });
  it("never applies to positive or missing totals", () => {
    expect(isUnpriced(job({ totalCharges: 23000 }))).toBe(false);
    expect(isUnpriced(job({ totalCharges: undefined, calculatedTotalCharges: undefined }))).toBe(false);
  });
});
