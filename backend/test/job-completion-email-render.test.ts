import { describe, expect, it } from "vitest";
import { opsJobCompletionSubject, renderOpsJobCompletionEmail } from "../src/google/gmail";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

function job(): Job {
  return {
    jobId: "TMV-456",
    calendarEventId: "cal-456",
    driverInitials: "HA",
    customerName: "Mary Major",
    customerEmail: "mary@example.com",
    customerPhone: "07000000000",
    pickup: "10 Alpha Road",
    dropoff: "20 Beta Street",
    stopBy: "15 Stop Lane",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 200,
    paidOnline: false,
    bookedStart: "2026-09-22T08:00:00.000Z",
    bookedFinish: "2026-09-22T10:00:00.000Z",
    actualStart: "2026-09-22T08:10:00.000Z",
    actualFinish: "2026-09-22T10:20:00.000Z",
    bookedMinutes: 120,
    actualMinutes: 130,
    differenceMinutes: 10,
    delayStatus: "Slight Delay",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    calculatedTotalCharges: 210,
    totalCharges: 210,
    amountCharged: 210,
    paymentMethod: "Bank Transfer",
    paymentStatus: "Recorded",
    clientNamePostcode: "",
    clientConfirmedBy: "Mary Major",
    signatureUrl: "https://example.com/signature.png",
    driveFolderId: "",
    driveFolderUrl: "",
    status: JobStatus.COMPLETED,
    currentState: WorkflowState.COMPLETED,
    rawTitle: "",
    rawDescription: "",
    createdAt: "2026-09-22T07:00:00.000Z",
    updatedAt: "2026-09-22T10:20:00.000Z"
  };
}

describe("renderOpsJobCompletionEmail", () => {
  it("includes the summary, submitted details, and dashboard View More link", () => {
    const email = renderOpsJobCompletionEmail(
      job(),
      { initials: "HA", fullName: "Haris Ali", email: "driver@example.com", vanRegistration: "AB12 CDE" },
      { completed: { Arrival: 1, VanLoaded: 2, EmptyVan: 1 }, pending: {}, failed: {}, hasSignature: true }
    );

    expect(opsJobCompletionSubject(job(), { initials: "HA", fullName: "Haris Ali", email: "driver@example.com", vanRegistration: "AB12 CDE" }))
      .toBe("Haris Ali completed the job of Mary Major");
    expect(email.text).toContain("Haris Ali completed the job of Mary Major");
    expect(email.html).toContain("Haris Ali completed the job of Mary Major");
    expect(email.text).toContain("Pickup: 10 Alpha Road");
    expect(email.text).toContain("Client confirmed by: Mary Major");
    expect(email.text).toContain("Arrival photos: 1");
    expect(email.text).toContain("View more: https://dashboard.themanvan.co.uk/?section=finished&job=TMV-456");
    expect(email.html).toContain("View More");
    expect(email.html).toContain("https://dashboard.themanvan.co.uk/?section=finished&amp;job=TMV-456");
  });
});
