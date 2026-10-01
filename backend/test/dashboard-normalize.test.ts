import { describe, expect, it, vi } from "vitest";
import { EvidenceStatus, ExtraChargeType, JobStatus, PaymentMethod } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

vi.mock("../src/auth/driver-account.service", () => ({
  listDriverProfiles: vi.fn().mockResolvedValue([])
}));

vi.mock("../src/db/settings.repo", () => ({
  getSetting: vi.fn((_: string, fallback: string) => Promise.resolve(fallback))
}));

import { normalizeMongoDataset } from "../src/admin/dashboard/normalize";

describe("normalizeMongoDataset", () => {
  it("includes the total adjustment note for admin displays", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-ADJUSTED",
        calendarEventId: "cal-adjusted",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
        actualStart: "2026-09-25T09:00:00.000Z",
        actualFinish: "2026-09-25T11:00:00.000Z",
        bookedMinutes: 120,
        actualMinutes: 120,
        differenceMinutes: 0,
        delayStatus: "On time",
        extraCharges: [],
        overtimeMinutes: 0,
        overtimeCharge: 0,
        calculatedTotalCharges: 100,
        totalCharges: 100,
        amountCharged: 80,
        totalAdjustmentNote: "Discount agreed with office",
        paymentMethod: "Card",
        paymentStatus: "Recorded",
        clientNamePostcode: "",
        clientConfirmedBy: "",
        signatureUrl: "",
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.COMPLETED,
        currentState: WorkflowState.COMPLETED,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T11:00:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [],
      fetchedAt: "2026-09-25T11:05:00.000Z",
      durationMs: 0
    });

    expect(job.totalAdjustmentNote).toBe("Discount agreed with office");
  });

  it("flags proof photos 15 minutes or more after verified tracker arrival, regardless of van loaded time", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-LOAD-LATE",
        calendarEventId: "cal-load-late",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
        actualStart: "2026-09-25T09:00:00.000Z",
        trackerArrivalAt: "2026-09-25T08:45:00.000Z",
        trackerLastSeenAt: "2026-09-25T08:45:00.000Z",
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
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_EMPTY_VAN_PHOTO,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T09:18:00.000Z"
      } as any],
      evidence: [
        {
          evidenceId: "arrival-1",
          jobId: "TMV-LOAD-LATE",
          driverEmail: "driver@example.com",
          evidenceType: "Arrival",
          contentType: "image/jpeg",
          fileName: "arrival.jpg",
          status: EvidenceStatus.COMPLETED,
          receivedAt: "2026-09-25T09:01:00.000Z",
          processingStartedAt: "2026-09-25T09:01:00.000Z",
          processingCompletedAt: "2026-09-25T09:02:00.000Z",
          cloudinaryPublicId: "arrival",
          cloudinaryUrl: "https://example.com/arrival.jpg",
          retryCount: 0,
          lastError: "",
          capturedAt: "2026-09-25T09:00:00.000Z"
        },
        {
          evidenceId: "loaded-1",
          jobId: "TMV-LOAD-LATE",
          driverEmail: "driver@example.com",
          evidenceType: "VanLoaded",
          contentType: "image/jpeg",
          fileName: "loaded.jpg",
          status: EvidenceStatus.COMPLETED,
          receivedAt: "2026-09-25T09:18:00.000Z",
          processingStartedAt: "2026-09-25T09:18:00.000Z",
          processingCompletedAt: "2026-09-25T09:19:00.000Z",
          cloudinaryPublicId: "loaded",
          cloudinaryUrl: "https://example.com/loaded.jpg",
          retryCount: 0,
          lastError: "",
          capturedAt: "2026-09-25T09:18:00.000Z"
        }
      ],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [],
      fetchedAt: "2026-09-25T09:20:00.000Z",
      durationMs: 0
    });

    expect(job.pickupArrivalAt).toBe("2026-09-25T09:00:00.000Z");
    expect(job.vanLoadedAt).toBe("2026-09-25T09:18:00.000Z");
    expect(job.trackerArrivalAt).toBe("2026-09-25T08:45:00.000Z");
    expect(job.trackerStatus).toBeUndefined();
    expect(job.arrivalProofDelayMinutes).toBe(15);
    expect(job.arrivalProofLate).toBe(true);
    expect(job.arrivalProofOverdue).toBe(false);
  });

  it("flags a missing proof photo only after a tracker-based reminder was issued", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-LOAD-OVERDUE",
        calendarEventId: "cal-load-overdue",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
        actualStart: "",
        trackerArrivalAt: "2026-09-25T09:00:00.000Z",
        trackerLastSeenAt: "2026-09-25T09:00:00.000Z",
        arrivalProofReminderSentAt: "2026-09-25T09:16:00.000Z",
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
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_LOADED_PHOTO,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T09:18:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [],
      fetchedAt: "2026-09-25T09:16:00.000Z",
      durationMs: 0
    });

    expect(job.pickupArrivalAt).toBeUndefined();
    expect(job.vanLoadedAt).toBeUndefined();
    expect(job.arrivalProofDelayMinutes).toBe(16);
    expect(job.arrivalProofLate).toBe(false);
    expect(job.arrivalProofOverdue).toBe(true);
    expect(job.trackerStatus).toBe("stale");
  });

  it("normalizes payment and extra charge breakdowns for admin views", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-MONEY",
        calendarEventId: "cal-money",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
        actualStart: "",
        actualFinish: "",
        bookedMinutes: 120,
        actualMinutes: 0,
        differenceMinutes: 0,
        delayStatus: "Waiting",
        extraCharges: [ExtraChargeType.CONGESTION, ExtraChargeType.EXTRA_TIME],
        overtimeMinutes: 120,
        overtimeCharge: 120,
        totalCharges: 235,
        amountCharged: 235,
        paymentMethod: "Card, Cash",
        paymentStatus: "Recorded",
        paymentBreakdown: [
          { method: PaymentMethod.CARD, amount: 135 },
          { method: PaymentMethod.CASH, amount: 100 }
        ],
        clientNamePostcode: "",
        clientConfirmedBy: "",
        clientSignatureAt: "2026-09-25T10:30:00.000Z",
        signatureUrl: "",
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.COMPLETED,
        currentState: WorkflowState.COMPLETED,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T08:00:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [],
      fetchedAt: "2026-09-25T09:18:00.000Z",
      durationMs: 0
    });

    expect(job.paymentBreakdown).toEqual([
      { method: "Card", amount: 13500 },
      { method: "Cash", amount: 10000 }
    ]);
    expect(job.extraChargeBreakdown).toEqual([
      { label: "London Congestion charge", amount: 1800 },
      { label: "Overtime (2 hrs)", amount: 12000, minutes: 120 }
    ]);
    expect(job.clientSignatureAt).toBe("2026-09-25T10:30:00.000Z");
  });

  it("preserves scenario photo and signature locations on document evidence items", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-LOC",
        calendarEventId: "cal-loc",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
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
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_LOADED_PHOTO,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T08:00:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [{
        jobId: "TMV-LOC",
        scenario: "parking",
        driver: "driver@example.com",
        fields: {},
        photoUrls: ["https://res.cloudinary.com/demo/image/upload/photo.jpg"],
        photoMeta: [{
          capturedAt: "2026-09-25T09:15:00.000Z",
          location: { lat: 51.5415459, lng: -0.0054064, accuracy: 5.78 },
          locationName: "Montfichet Road, Stratford"
        }],
        signatureUrl: "https://res.cloudinary.com/demo/image/upload/signature.png",
        signatureMeta: {
          capturedAt: "2026-09-25T09:16:00.000Z",
          location: { lat: 51.5415629, lng: -0.0054603, accuracy: 10.14 },
          locationName: "Montfichet Road, Stratford"
        },
        submittedAt: "2026-09-25T09:17:00.000Z"
      }],
      fetchedAt: "2026-09-25T09:18:00.000Z",
      durationMs: 0
    });

    const documents = job.evidenceItems.filter(item => item.category === "Documents");

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      fileName: "Parking Liability photo 1",
      capturedAt: "2026-09-25T09:15:00.000Z",
      location: { lat: 51.5415459, lng: -0.0054064, accuracy: 5.78 },
      locationName: "Montfichet Road, Stratford"
    });
    expect(documents[1]).toMatchObject({
      fileName: "Parking Liability signature",
      capturedAt: "2026-09-25T09:16:00.000Z",
      location: { lat: 51.5415629, lng: -0.0054603, accuracy: 10.14 },
      locationName: "Montfichet Road, Stratford"
    });
  });

  it("normalizes the scenario checkpoint point for finished-job admin previews", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-POINT",
        calendarEventId: "cal-point",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
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
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_LOADED_PHOTO,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T08:00:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [{
        jobId: "TMV-POINT",
        scenario: "liability",
        driver: "driver@example.com",
        fields: { reported_at: "Drop-off — 123 Drop Street", damage_categories: "Wall mark" },
        photoUrls: [],
        submittedAt: "2026-09-25T09:17:00.000Z"
      }],
      fetchedAt: "2026-09-25T09:18:00.000Z",
      durationMs: 0
    });

    expect(job.scenarios[0]).toMatchObject({
      reportedAt: "Drop-off — 123 Drop Street",
      reportedAtPoint: "Drop-off"
    });
  });
});
