import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../types";
import { finalChargeOutlier, jobAttention } from "./useAttention";

const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({
  jobId: "J1", status: "COMPLETED", driverInitials: "MA", driverName: "MAN VAN", customerName: "Sample",
  basePrice: 18000, extraCharges: 3160, overtimeCharge: 0, congestionCharge: 0, tunnelCharge: 0, amountCharged: 21160,
  evidenceCompleteness: { arrival: "COMPLETED", vanLoaded: "COMPLETED", stopBy: "MISSING", emptyVan: "COMPLETED", organized: "MISSING", signature: "COMPLETED" }, ...patch
} as NormalizedJob);

describe("finalChargeOutlier", () => {
  it("flags the mistyped final charge behind the £898m MAN VAN total", () => {
    const flagged = job({ amountCharged: 89898888800 });
    expect(finalChargeOutlier(flagged)).toEqual({ finalPence: 89898888800, expectedPence: 21160 });
    const item = jobAttention(flagged).find(entry => entry.category === "charge");
    expect(item?.title).toBe("Final charge to check · £898,988,888.00");
    expect(item?.detail).toContain("£211.60");
  });
  it("leaves ordinary adjustments and unknown parts alone", () => {
    expect(finalChargeOutlier(job({}))).toBeNull();
    expect(finalChargeOutlier(job({ amountCharged: 60000 }))).toBeNull(); // extra stop agreed on site
    expect(finalChargeOutlier(job({ basePrice: 0, extraCharges: 0, amountCharged: 89898888800 }))).toBeNull();
    expect(finalChargeOutlier(job({ status: "READY", amountCharged: 89898888800 }))).toBeNull();
  });
});
