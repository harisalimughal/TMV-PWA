import { describe, expect, it } from "vitest";
import { jobServiceType, jobsForDriver } from "./workBreakdown";
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
});
