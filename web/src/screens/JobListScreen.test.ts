import { describe, expect, it } from "vitest";
import type { Job } from "../api/jobs";
import { selectVisibleDriverJobs } from "./JobListScreen";

function job(jobId: string, bookedStart: string, status: Job["status"] = "READY"): Job {
  return {
    jobId,
    calendarEventId: jobId,
    driverInitials: "HE",
    customerName: "Customer",
    customerEmail: "",
    customerPhone: "",
    pickup: "A",
    dropoff: "B",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 100,
    paidOnline: false,
    bookedStart,
    bookedFinish: bookedStart,
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 120,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "Waiting",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 100,
    amountCharged: 0,
    paymentMethod: "",
    paymentStatus: "",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    status,
    currentState: status,
    createdAt: bookedStart,
    updatedAt: bookedStart
  };
}

describe("selectVisibleDriverJobs", () => {
  it("keeps an unfinished 8am job active with a 9am job in Upcoming after both scheduled times", () => {
    const current = job("8AM", "2026-10-12T07:00:00Z", "IN_PROGRESS");
    current.bookedFinish = "2026-10-12T08:00:00Z";
    current.actualFinish = "2026-10-12T08:15:00Z";
    const later = job("9AM", "2026-10-12T08:00:00Z");
    const visible = selectVisibleDriverJobs({ today: [later, current], past: [], next: [] });
    expect(visible.today?.jobId).toBe("8AM");
    expect(visible.upcomingGroups.flatMap(group => group.jobs.map(job => job.jobId))).toEqual(["9AM"]);
  });
  it("promotes a newly assigned earlier today job and moves the later one back to upcoming", () => {
    const visible = selectVisibleDriverJobs({
      today: [
        job("TMV-10AM", "2026-09-30T09:00:00.000Z"),
        job("TMV-930AM", "2026-09-30T08:30:00.000Z")
      ],
      past: [],
      next: []
    });

    expect(visible.today?.jobId).toBe("TMV-930AM");
    expect(visible.upcomingGroups.flatMap(group => group.jobs.map(j => j.jobId))).toEqual(["TMV-10AM"]);
    expect(visible.counts).toEqual({ today: 1, upcoming: 1, previous: 0 });
  });
});
