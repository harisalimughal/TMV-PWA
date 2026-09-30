import { describe, expect, it } from "vitest";
import {
  adjustmentReason,
  extraChargeBreakdownLines,
  jobServiceType,
  jobsForDriver,
  paymentBreakdownLines,
  totalChargesForJob
} from "./workBreakdown";
import type { NormalizedJob } from "../types";

const baseJob = {
  jobId: "TMV-1",
  driverInitials: "TI",
  status: "COMPLETED",
  rawTitle: "",
  rawDescription: "",
  bookingDetails: {},
  extraChargeSelections: []
} as unknown as NormalizedJob;

describe("work breakdown helpers", () => {
  it("detects full packing service from the booking text or selected charge", () => {
    expect(jobServiceType({ ...baseJob, rawDescription: "Full PACKING service required" })).toBe("Full/Packing Service");
    expect(jobServiceType({ ...baseJob, extraChargeSelections: ["Packing Service"] })).toBe("Full/Packing Service");
    expect(jobServiceType(baseJob)).toBe("Normal Service");
  });

  it("returns completed jobs for the clicked driver only", () => {
    const jobs = [
      { ...baseJob, jobId: "TMV-1", driverInitials: "TI", status: "COMPLETED" },
      { ...baseJob, jobId: "TMV-2", driverInitials: "MR", status: "COMPLETED" },
      { ...baseJob, jobId: "TMV-3", driverInitials: "TI", status: "IN_PROGRESS" }
    ] as NormalizedJob[];

    expect(jobsForDriver(jobs, "TI").map(job => job.jobId)).toEqual(["TMV-1"]);
  });

  it("orders the clicked driver's jobs newest first", () => {
    const jobs = [
      { ...baseJob, jobId: "TMV-OLD", driverInitials: "TI", status: "COMPLETED", bookedStart: "2026-09-03T08:45:00.000Z" },
      { ...baseJob, jobId: "TMV-NEW", driverInitials: "TI", status: "COMPLETED", bookedStart: "2026-09-14T15:00:00.000Z" },
      { ...baseJob, jobId: "TMV-MID", driverInitials: "TI", status: "COMPLETED", bookedStart: "2026-09-08T12:00:00.000Z" }
    ] as NormalizedJob[];

    expect(jobsForDriver(jobs, "TI").map(job => job.jobId)).toEqual(["TMV-NEW", "TMV-MID", "TMV-OLD"]);
  });

  it("formats each payment method with its own amount", () => {
    expect(paymentBreakdownLines({
      ...baseJob,
      paymentMethod: "Cash, Card",
      paymentBreakdown: [
        { method: "Cash", amount: 0 },
        { method: "Card", amount: 8000 }
      ]
    })).toEqual(["Cash £0.00", "Card £80.00"]);
  });
  it("splits legacy combined payment methods instead of showing one ambiguous line", () => {
    expect(paymentBreakdownLines({
      ...baseJob,
      paymentMethod: "Cash, Card",
      paymentBreakdown: [
        { method: "Cash, Card", amount: 8000 }
      ]
    })).toEqual(["Cash", "Card"]);
  });

  it("uses calculated total charges when the stored total is missing", () => {
    expect(totalChargesForJob({
      ...baseJob,
      totalCharges: 0,
      calculatedTotalCharges: 12000,
      basePrice: 8000,
      extraCharges: 3000,
      overtimeCharge: 1000
    })).toBe(12000);
  });

  it("shows a fallback adjustment reason when no driver note was needed", () => {
    expect(adjustmentReason({ ...baseJob, totalAdjustmentNote: "Discount agreed with office" })).toBe("Discount agreed with office");
    expect(adjustmentReason({ ...baseJob, totalAdjustmentNote: "   " })).toBe("None");
    expect(adjustmentReason(baseJob)).toBe("None");
  });

  it("formats extra charges as separate visible lines", () => {
    expect(extraChargeBreakdownLines({
      ...baseJob,
      extraChargeBreakdown: [
        { label: "Tunnel", amount: 1500 },
        { label: "Overtime (2 hrs)", amount: 12000 }
      ]
    })).toEqual(["Tunnel £15.00", "Overtime (2 hrs) £120.00"]);
    expect(extraChargeBreakdownLines(baseJob)).toEqual(["None"]);
  });
});


