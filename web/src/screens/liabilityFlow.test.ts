import { describe, expect, it } from "vitest";
import {
  liabilityCheckpointOptions,
  pickLiabilityJob,
  reportedAtForLiabilityCheckpoint
} from "./liabilityFlow";
import type { Job } from "../api/jobs";

function job(overrides: Partial<Job>): Job {
  return {
    jobId: overrides.jobId ?? "TMV-1",
    calendarEventId: "",
    driverInitials: "WD",
    customerName: "Customer",
    customerEmail: "",
    customerPhone: "",
    pickup: "Pickup address",
    dropoff: "Drop-off address",
    stopBy: "Stop-by address",
    rawTitle: "",
    rawDescription: "",
    crewSize: 2,
    basePrice: 100,
    paidOnline: false,
    bookedStart: "",
    bookedFinish: "",
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 0,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 0,
    paymentMethod: "",
    paymentStatus: "",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    status: overrides.status ?? "READY",
    currentState: overrides.currentState ?? "READY",
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("liability flow helpers", () => {
  it("keeps the liability checkpoint options in the driver-facing order", () => {
    expect(liabilityCheckpointOptions.map(option => option.label)).toEqual(["Pickup", "Stop-by", "Drop-off"]);
  });

  it("uses the requested job when opening Liability from the main job flow", () => {
    const active = job({ jobId: "active", status: "IN_PROGRESS" });
    const requested = job({ jobId: "requested", status: "READY" });

    expect(pickLiabilityJob({ today: [active], past: [], next: [requested] }, "requested")?.jobId).toBe("requested");
  });

  it("falls back to the current in-progress job when Liability is opened from the tab", () => {
    const ready = job({ jobId: "ready", status: "READY" });
    const active = job({ jobId: "active", status: "IN_PROGRESS" });

    expect(pickLiabilityJob({ today: [ready, active], past: [], next: [] })?.jobId).toBe("active");
  });

  it("records the selected checkpoint location in scenario fields", () => {
    const sample = job({});

    expect(reportedAtForLiabilityCheckpoint("pickup", sample)).toEqual({
      label: "Pickup",
      address: "Pickup address"
    });
    expect(reportedAtForLiabilityCheckpoint("stopby", sample)).toEqual({
      label: "Stop-by",
      address: "Stop-by address"
    });
    expect(reportedAtForLiabilityCheckpoint("dropoff", sample)).toEqual({
      label: "Drop-off",
      address: "Drop-off address"
    });
  });
});
