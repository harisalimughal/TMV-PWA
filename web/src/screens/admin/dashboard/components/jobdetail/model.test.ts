import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../types";
import { paperJobSample } from "../../../../../../test/reportPreview.sample";
import { activityGroup, comparisonRows, durationBars, evidenceRows, lifecycleOf, mailHref, milestoneSummary, milestonesOf, recordedReceiptsPence, telHref } from "./model";

const base = paperJobSample as NormalizedJob;
const blank = (patch: Partial<NormalizedJob>) => ({ ...base, onMyWayAt: undefined, trackerArrivalAt: undefined, pickupArrivalAt: undefined, vanLoadedAt: undefined, actualFinish: undefined, clientSignatureAt: undefined, dropoffTracking: undefined, ...patch }) as NormalizedJob;

describe("job preview model", () => {
  it("derives the lifecycle from status only", () => {
    expect(lifecycleOf({ status: "READY" })).toBe("scheduled");
    expect(lifecycleOf({ status: "IN_PROGRESS" })).toBe("active");
    expect(lifecycleOf({ status: "COMPLETED" })).toBe("completed");
    expect(lifecycleOf({ status: "CANCELLED" })).toBe("cancelled");
  });
  it("says Not yet for a scheduled job and Not recorded for a completed one", () => {
    const scheduled = milestonesOf(blank({ status: "READY" }));
    expect(scheduled.every(item => item.state === "pending")).toBe(true);
    expect(milestoneSummary(scheduled, { status: "READY" }).text).toBe("Nothing expected yet");
    const completed = milestonesOf(blank({ status: "COMPLETED" }));
    expect(completed.every(item => item.state === "missing")).toBe(true);
    expect(milestoneSummary(completed, { status: "COMPLETED" }).text).toBe("0 of 8 recorded");
  });
  it("treats later steps of an active job as not yet and a stated tracker gap as unverified", () => {
    const active = milestonesOf(blank({ status: "IN_PROGRESS", onMyWayAt: "2026-10-15T08:00:00Z", trackerUnverifiedReason: "stale GPS" }));
    expect(active.find(item => item.key === "pickup")?.state).toBe("unverified");
    expect(active.find(item => item.key === "empty")?.state).toBe("pending");
  });
  it("never gives a tracker event without data a time", () => {
    const item = milestonesOf(blank({ status: "COMPLETED" })).find(entry => entry.key === "dropoff")!;
    expect(item.at).toBeUndefined();
  });
  it("only offers a call link for a real phone number", () => {
    expect(telHref("07700 900123")).toBe("tel:07700900123");
    expect(telHref("+44 20 3773 9113")).toBe("tel:+442037739113");
    for (const bad of ["Not recorded", "", undefined, "123", "javascript:alert(1)"]) expect(telHref(bad)).toBeNull();
    expect(mailHref("a@b.co")).toBe("mailto:a@b.co");
    expect(mailHref("Not recorded")).toBeNull();
    expect(mailHref("a@b.co?cc=x@y.z")).toBeNull();
  });
  it("keeps invoices out of recorded receipts", () => {
    expect(recordedReceiptsPence({ ...base, paymentBreakdown: [{ method: "Card", amount: 100 }, { method: "Invoice", amount: 50 }] } as NormalizedJob)).toBe(100);
    expect(recordedReceiptsPence({ ...base, paymentBreakdown: undefined } as NormalizedJob)).toBeNull();
  });
  it("compares only measures that exist on both sides", () => {
    const rows = comparisonRows({ ...base, driverJobSummary: undefined, actualMinutes: 90 } as NormalizedJob, { minutes: v => String(v), money: v => String(v) });
    expect(rows.find(row => row.key === "time")).toMatchObject({ state: "incomplete", driver: "Not submitted" });
  });
  it("marks required evidence not yet for a scheduled job", () => {
    const rows = evidenceRows(blank({ status: "READY", evidenceCompleteness: { arrival: "MISSING", vanLoaded: "MISSING", stopBy: "MISSING", emptyVan: "MISSING", organized: "MISSING", signature: "MISSING" } }));
    expect(rows.every(row => row.state === "pending")).toBe(true);
  });
  it("draws the four duration measures as separate bars", () => {
    const bars = durationBars({ ...base, bookedStart: "2026-10-15T09:00:00Z", bookedFinish: "2026-10-15T13:00:00Z", timeBilling: { allocatedMinutes: 240, actualMinutes: 254 } } as NormalizedJob);
    expect(bars.map(bar => bar.key)).toEqual(expect.arrayContaining(["booked", "billed", "actual"]));
  });
  it("groups activity by what it is about", () => {
    expect(activityGroup({ action: "PAYMENT_RECORDED" })).toBe("payments");
    expect(activityGroup({ action: "ARRIVAL_PHOTO_UPLOADED" })).toBe("evidence");
    expect(activityGroup({ action: "ON_MY_WAY" })).toBe("driver");
    expect(activityGroup({ action: "SOMETHING_ELSE" })).toBe("other");
  });
});
