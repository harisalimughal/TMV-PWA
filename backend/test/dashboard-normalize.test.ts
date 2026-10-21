import { describe, expect, it, vi } from "vitest";
import { EvidenceStatus, ExtraChargeType, JobStatus, PaymentMethod } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";
import { calculateJobTimeBilling } from "../src/jobs/job-time-billing";
import { pence } from "../src/utils/money";

vi.mock("../src/auth/driver-account.service", () => ({
  listDriverProfiles: vi.fn().mockResolvedValue([])
}));

vi.mock("../src/db/settings.repo", () => ({
  getSetting: vi.fn((_: string, fallback: string) => Promise.resolve(fallback))
}));

import { normalizeMongoDataset } from "../src/admin/dashboard/normalize";

describe("normalizeMongoDataset", () => {
  it("exposes the same start date used by backend range filters", async () => {
    const bookedStart = "2026-10-09T09:00:00Z", actualStart = "2026-10-10T09:00:00Z";
    const jobs = [
      { jobId: "GENUINE", actualStart },
      { jobId: "SYNTHETIC", actualStart, actualStartSource: "completion-fallback" },
      { jobId: "INVALID", actualStart: "invalid" },
      { jobId: "BOOKED" }
    ].map(job => ({ bookedStart, bookedFinish: "2026-10-09T11:00:00Z", status: JobStatus.COMPLETED, driverInitials: "TI", extraCharges: [], ...job }));
    const normalized = await normalizeMongoDataset({ jobs: jobs as any, evidence: [], activity: [], exceptions: [], scenarioSubmissions: [], fetchedAt: actualStart, durationMs: 0 });
    expect(normalized.map(job => job.effectiveStart)).toEqual(["2026-10-10T09:00:00.000Z", ...Array(3).fill("2026-10-09T09:00:00.000Z")]);
  });
  it("exposes reassignment warnings and links while resolving the real Calendar event", async () => {
    const notice = { kind: "admin-completed", detectedAt: "2026-10-16T08:00:00Z", previousStart: "2026-10-13T08:00:00Z",
      previousFinish: "2026-10-13T10:00:00Z", previousDriverInitials: "TI", scheduledStart: "2026-10-16T12:00:00Z",
      scheduledFinish: "2026-10-16T14:00:00Z", driverInitials: "MK" };
    const [normalized] = await normalizeMongoDataset({
      jobs: [{ jobId: "NEW", calendarEventId: "reschedule:NEW", sourceCalendarEventId: "calendar-event",
        rescheduledFromJobId: "OLD", rescheduleNotice: notice, status: JobStatus.READY, driverInitials: "MK",
        bookedStart: notice.scheduledStart, bookedFinish: notice.scheduledFinish, totalCharges: 115, extraCharges: [] } as any],
      evidence: [], activity: [], exceptions: [], scenarioSubmissions: [], fetchedAt: notice.detectedAt, durationMs: 0
    });
    expect(normalized).toMatchObject({ calendarEventId: "calendar-event", rescheduledFromJobId: "OLD", rescheduleNotice: notice });
  });
  it("uses verified GPS for arrival delay while keeping proof time and billing boundaries separate", async () => {
    const [normalized] = await normalizeMongoDataset({
      jobs: [{ jobId: "GPS-ARRIVAL", status: JobStatus.COMPLETED, driverInitials: "AB",
        bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:30:00Z",
        actualStart: "2026-10-09T09:20:00Z", actualFinish: "2026-10-09T11:00:00Z",
        trackerArrivalAt: "2026-10-09T09:00:00Z", trackerArrivalSource: "two-fresh-reports",
        totalCharges: 100, extraCharges: [] } as any],
      evidence: [], activity: [], exceptions: [], scenarioSubmissions: [],
      fetchedAt: "2026-10-09T12:00:00Z", durationMs: 0
    });
    expect(normalized).toMatchObject({ delayMinutes: 0, arrivalDelaySource: "gps-two-fresh-reports", actualStart: "2026-10-09T09:20:00.000Z" });
    expect(normalized.actualMinutes).toBe(100);
  });
  it("uses saved duration, rates and fee snapshots for all financial/report consumers", async () => {
    const billing = calculateJobTimeBilling({
      bookedStart: "2026-09-25T09:00:00Z", bookedFinish: "2026-09-25T10:30:00Z",
      actualStart: "2026-09-25T09:00:00Z", actualFinish: "2026-09-25T11:30:00Z",
      rate: { per30Pence: pence(5500), source: "calendar" }, partialBlockPolicy: "round-up"
    });
    const [normalized] = await normalizeMongoDataset({
      jobs: [{
        jobId: "SNAPSHOT", status: JobStatus.COMPLETED, driverInitials: "AB",
        bookedStart: billing.bookedStart, bookedFinish: billing.bookedFinish,
        actualStart: billing.actualStart, actualFinish: billing.actualFinish,
        bookedMinutes: 999, actualMinutes: 999, basePrice: 999, overtimeCharge: 999,
        overtimeMinutes: 999, timeBilling: billing, timeBillingStatus: "verified",
        chargeSnapshot: { basePence: 10000, congestionPence: 1800, tunnelPence: 1360 },
        extraCharges: [ExtraChargeType.CONGESTION, ExtraChargeType.TUNNEL],
        calculatedTotalCharges: 186.60, amountCharged: 186.60, paymentMethod: "Card"
      } as any], evidence: [], activity: [], exceptions: [], scenarioSubmissions: [],
      fetchedAt: "2026-09-25T12:00:00Z", durationMs: 0
    });
    expect(normalized).toMatchObject({ bookedMinutes: 90, allocatedMinutes: 120, actualMinutes: 150,
      overtimeMinutes: 30, overtimeCharge: 5500, basePrice: 10000, extraCharges: 3160,
      congestionCharge: 1800, tunnelCharge: 1360, totalCharges: 18660, timeBillingStatus: "verified" });
  });

  it("retains historical completed totals instead of repricing from current settings", async () => {
    const [normalized] = await normalizeMongoDataset({
      jobs: [{ jobId: "LEGACY", status: JobStatus.COMPLETED, driverInitials: "AB",
        bookedStart: "2026-09-25T09:00:00Z", bookedFinish: "2026-09-25T10:30:00Z",
        basePrice: 100, totalCharges: 120, amountCharged: 120, overtimeCharge: 0,
        extraCharges: [ExtraChargeType.CONGESTION, ExtraChargeType.TUNNEL] } as any],
      evidence: [], activity: [], exceptions: [], scenarioSubmissions: [],
      fetchedAt: "2026-09-25T12:00:00Z", durationMs: 0
    });
    expect(normalized.totalCharges).toBe(12000);
    expect(normalized.timeBillingStatus).toBe("legacy");
    expect(normalized.timeBilling).toBeUndefined();
    expect(normalized.roadFeeAmounts).toEqual({ congestionPence: null, tunnelPence: null });
  });
  it("keeps documented discounts reconciled while retaining the original automatic calculation", async () => {
    const [normalized] = await normalizeMongoDataset({ jobs: [{ jobId: "DISCOUNT", status: JobStatus.COMPLETED, driverInitials: "AB",
      bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T11:00:00Z", basePrice: 250, totalCharges: 220,
      calculatedTotalCharges: 250, amountCharged: 220, totalAdjustmentNote: "Agreed discount", extraCharges: [] } as any],
      evidence: [], activity: [], exceptions: [], scenarioSubmissions: [], fetchedAt: "2026-10-09T12:00:00Z", durationMs: 0 });
    expect(normalized).toMatchObject({ calculatedTotalCharges: 25000, totalCharges: 22000, amountCharged: 22000, reconciled: true });
  });

  it("excludes fallback completion durations from working-hour summaries", async () => {
    const [normalized] = await normalizeMongoDataset({
      jobs: [{ jobId: "FALLBACK", status: JobStatus.COMPLETED, driverInitials: "AB",
        bookedStart: "2026-09-25T09:00:00Z", bookedFinish: "2026-09-25T10:30:00Z",
        actualStart: "2026-09-25T09:00:00Z", actualFinish: "2026-10-01T09:00:00Z",
        actualFinishSource: "admin-manual", actualMinutes: 8640, timeBillingStatus: "needs-verification",
        totalCharges: 100, extraCharges: [] } as any],
      evidence: [], activity: [], exceptions: [], scenarioSubmissions: [],
      fetchedAt: "2026-10-01T12:00:00Z", durationMs: 0
    });
    expect(normalized.actualMinutes).toBeUndefined();
    expect(normalized.timeBillingStatus).toBe("needs-verification");
  });

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
        trackerArrivalDistanceMeters: 405,
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
    expect(job.trackerArrivalDistanceMeters).toBe(405);
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
        chargeSnapshot: { basePence: 11500, congestionPence: 1800, tunnelPence: 0 },
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
