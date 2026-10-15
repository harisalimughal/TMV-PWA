import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";
import { calculateJobTimeBilling } from "../src/jobs/job-time-billing";
import { pence } from "../src/utils/money";

const listCalendarEvents = vi.fn();
const listJobs = vi.fn();
const getJob = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const saveRescheduledAttempt = vi.fn().mockResolvedValue(undefined);
const listActivityForJob = vi.fn().mockResolvedValue([]);
const appendActivity = vi.fn().mockResolvedValue(undefined);
const notifyDriverJobAssigned = vi.fn().mockResolvedValue(undefined);
const geocodeAddress = vi.fn();

vi.mock("../src/google/calendar", () => ({
  listCalendarEvents: (...args: any[]) => listCalendarEvents(...args)
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args),
  saveRescheduledAttempt: (...args: any[]) => saveRescheduledAttempt(...args)
}));
vi.mock("../src/db/activity.repo", () => ({
  listActivityForJob: (...args: any[]) => listActivityForJob(...args),
  appendActivity: (...args: any[]) => appendActivity(...args)
}));
vi.mock("../src/jobs/driver-notify", () => ({
  notifyDriverJobAssigned: (...args: any[]) => notifyDriverJobAssigned(...args)
}));
vi.mock("../src/integrations/geocode", () => ({
  geocodeAddress: (...args: any[]) => geocodeAddress(...args)
}));

import { syncBookingsForDate } from "../src/jobs/booking.service";

const bookedStart = "2026-09-24T09:00:00+01:00";
const bookedFinish = "2026-09-24T12:00:00+01:00";

function calendarEvent(description: string) {
  return {
    id: "evt-on-my-way",
    status: "confirmed",
    summary: "2 men 175/Y-MI",
    description,
    start: { dateTime: bookedStart },
    end: { dateTime: bookedFinish }
  } as any;
}

function existingJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "TMV-EXISTING",
    calendarEventId: "evt-on-my-way",
    driverInitials: "MI",
    customerName: "Client One",
    customerEmail: "client@example.com",
    customerPhone: "07111222333",
    pickup: "Old pickup",
    dropoff: "Old dropoff",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 175,
    paidOnline: true,
    bookedStart,
    bookedFinish,
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 180,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "Waiting",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 175,
    amountCharged: 0,
    paymentMethod: "",
    paymentStatus: "Paid Online",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    onMyWayAt: "2026-09-24T07:45:00.000Z",
    signatureUrl: "",
    driveFolderId: "",
    driveFolderUrl: "",
    status: JobStatus.READY,
    currentState: WorkflowState.READY,
    rawTitle: "2 men 175/Y-MI",
    rawDescription: "Name: Client One",
    createdAt: "2026-09-23T10:00:00.000Z",
    updatedAt: "2026-09-23T10:00:00.000Z",
    ...overrides
  };
}

describe("syncBookingsForDate", () => {
  it("retains loaded time and drop-off observations on resync, resetting observations when the destination changes", async () => {
    const tracking = { imei: "123", arrivalAt: "2026-09-24T10:00:00Z" };
    const existing = existingJob({ actualStart: bookedStart, vanLoadedAt: "2026-09-24T09:30:00Z", dropoffLocation: { lat: 51.5, lng: -0.1 }, dropoffTracking: tracking });
    listJobs.mockResolvedValue([existing]); getJob.mockResolvedValue(existing);
    listCalendarEvents.mockResolvedValue([calendarEvent("Name: Client One\nPickup: Old pickup\nDelivery: Old dropoff")]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));
    expect(upsertJob.mock.calls.at(-1)?.[0]).toMatchObject({ vanLoadedAt: existing.vanLoadedAt, dropoffLocation: existing.dropoffLocation, dropoffTracking: tracking });
    listCalendarEvents.mockResolvedValue([calendarEvent("Name: Client One\nPickup: Old pickup\nDelivery: New dropoff")]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));
    expect(upsertJob.mock.calls.at(-1)?.[0].dropoffTracking).toBeUndefined();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(null);
    geocodeAddress.mockResolvedValue(null);
    listActivityForJob.mockResolvedValue([]);
  });

  it("keeps a driver-completed job closed and flags the changed schedule in red metadata", async () => {
    const previous = existingJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED,
      actualStart: bookedStart, actualFinish: bookedFinish, actualFinishSource: "empty-van-photo", amountCharged: 175 });
    const event = calendarEvent("Name: Client One");
    event.start.dateTime = "2026-09-25T14:00:00+01:00";
    event.end.dateTime = "2026-09-25T16:00:00+01:00";
    event.summary = "2 men 175/Y-MK";
    listJobs.mockResolvedValue([previous]); getJob.mockResolvedValue(previous); listCalendarEvents.mockResolvedValue([event]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    const saved = upsertJob.mock.calls[0][0];
    expect(saved).toMatchObject({ status: JobStatus.COMPLETED, bookedStart, bookedFinish, amountCharged: 175,
      rescheduleNotice: { kind: "driver-completed", scheduledStart: event.start.dateTime, driverInitials: "MK" } });
    expect(saveRescheduledAttempt).not.toHaveBeenCalled();
    expect(notifyDriverJobAssigned).not.toHaveBeenCalled();
    listJobs.mockResolvedValue([saved]); getJob.mockResolvedValue(saved); upsertJob.mockClear();
    await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("publishes a clean rescheduled attempt for admin-completed work and retains the original history", async () => {
    const previous = existingJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED,
      actualStart: bookedStart, actualFinish: bookedFinish, actualFinishSource: "admin-manual",
      reportIdentity: { initials: "TI", email: null, name: null, vehicleImei: null, source: "admin-completion-assignment" },
      manualDetailsRequiredAt: bookedFinish, signatureUrl: "old-signature", paymentBreakdown: [{ method: "Cash", amount: 175 }],
      chargeSnapshot: { basePence: 17500, congestionPence: 0, tunnelPence: 0 }, reviewEmailSent: true, amountCharged: 175 });
    const event = calendarEvent("Name: Client One");
    event.start.dateTime = "2026-09-25T14:00:00+01:00";
    event.end.dateTime = "2026-09-25T16:00:00+01:00";
    event.summary = "2 men 175/Y-MK";
    listJobs.mockResolvedValue([previous]); getJob.mockResolvedValue(previous); listCalendarEvents.mockResolvedValue([event]);
    const [fresh] = await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    expect(saveRescheduledAttempt).toHaveBeenCalledWith(previous, fresh);
    expect(fresh).toMatchObject({ status: JobStatus.READY, currentState: WorkflowState.READY,
      driverInitials: "MK", bookedStart: event.start.dateTime, bookedFinish: event.end.dateTime,
      actualStart: "", actualFinish: "", signatureUrl: "", amountCharged: 0, rescheduledFromJobId: previous.jobId,
      sourceCalendarEventId: event.id, rescheduleNotice: { kind: "admin-completed" } });
    expect(fresh.jobId).not.toBe(previous.jobId);
    expect(fresh.calendarEventId).not.toBe(previous.calendarEventId);
    for (const key of ["onMyWayAt", "vanLoadedAt", "pickupArrivalAt", "dropoffTracking", "reportIdentity", "timeBilling", "chargeSnapshot", "paymentBreakdown", "manualDetailsRequiredAt", "reviewEmailSent"] as const) expect(fresh[key]).toBeUndefined();
    expect(notifyDriverJobAssigned).toHaveBeenCalledWith(fresh, "MK");
    expect(upsertJob).not.toHaveBeenCalled();
    expect(previous.status).toBe(JobStatus.COMPLETED);
    expect(previous.paymentBreakdown).toEqual([{ method: "Cash", amount: 175 }]);

    // Later syncs keep the clean attempt, not the historical completion.
    const historical = { ...previous, rescheduledToJobId: fresh.jobId };
    listJobs.mockResolvedValue([fresh, historical]); getJob.mockResolvedValue(fresh);
    saveRescheduledAttempt.mockClear(); notifyDriverJobAssigned.mockClear();
    const [again] = await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    expect(again.jobId).toBe(fresh.jobId);
    expect(again.sourceCalendarEventId).toBe(event.id);
    expect(again.rescheduleNotice).toEqual(fresh.rescheduleNotice);
    expect(saveRescheduledAttempt).not.toHaveBeenCalled();
    expect(notifyDriverJobAssigned).not.toHaveBeenCalled();
    event.start.dateTime = "2026-09-26T14:00:00+01:00";
    event.end.dateTime = "2026-09-26T16:00:00+01:00";
    await syncBookingsForDate(DateTime.fromISO("2026-09-26", { zone: "Europe/London" }));
    expect(upsertJob.mock.calls.at(-1)?.[0]).toMatchObject({ jobId: fresh.jobId, status: JobStatus.READY,
      bookedStart: event.start.dateTime, rescheduleNotice: { kind: "admin-completed", scheduledStart: event.start.dateTime } });
    expect(saveRescheduledAttempt).not.toHaveBeenCalled();
  });

  it("uses the admin audit action even if an empty-van time was already recorded", async () => {
    const previous = existingJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED,
      actualStart: bookedStart, actualFinish: bookedFinish, actualFinishSource: "empty-van-photo" });
    const event = calendarEvent("Name: Client One");
    event.start.dateTime = "2026-09-25T14:00:00+01:00";
    event.end.dateTime = "2026-09-25T16:00:00+01:00";
    listJobs.mockResolvedValue([previous]); getJob.mockResolvedValue(previous); listCalendarEvents.mockResolvedValue([event]);
    listActivityForJob.mockResolvedValue([{ action: "ADMIN_MARKED_COMPLETED" }]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    expect(saveRescheduledAttempt).toHaveBeenCalledTimes(1);
  });

  it("does not reopen completed jobs for driver-only edits or equivalent timezone representations", async () => {
    const previous = existingJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED,
      actualFinishSource: "admin-manual", actualStart: bookedStart, actualFinish: bookedFinish });
    const event = calendarEvent("Name: Client One");
    event.summary = "2 men 175/Y-MK";
    event.start.dateTime = "2026-09-24T08:00:00Z";
    event.end.dateTime = "2026-09-24T11:00:00Z";
    listJobs.mockResolvedValue([previous]); getJob.mockResolvedValue(previous); listCalendarEvents.mockResolvedValue([event]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-24", { zone: "Europe/London" }));
    expect(saveRescheduledAttempt).not.toHaveBeenCalled();
    expect(upsertJob.mock.calls[0][0].status).toBe(JobStatus.COMPLETED);
    expect(upsertJob.mock.calls[0][0].rescheduleNotice).toBeUndefined();
  });

  it("reschedules unstarted work normally without a completed-job warning", async () => {
    const previous = existingJob({ onMyWayAt: undefined });
    const event = calendarEvent("Name: Client One");
    event.start.dateTime = "2026-09-25T14:00:00+01:00";
    event.end.dateTime = "2026-09-25T16:00:00+01:00";
    listJobs.mockResolvedValue([previous]); getJob.mockResolvedValue(previous); listCalendarEvents.mockResolvedValue([event]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-25", { zone: "Europe/London" }));
    expect(upsertJob.mock.calls[0][0]).toMatchObject({ status: JobStatus.READY, bookedStart: event.start.dateTime });
    expect(upsertJob.mock.calls[0][0].rescheduleNotice).toBeUndefined();
  });

  it("preserves onMyWayAt when a Calendar resync updates an already-notified job", async () => {
    listJobs.mockResolvedValue([existingJob({
      pickupLocation: { lat: 51.5, lng: -0.14 },
      gpsliveImei: "123456789012345",
      trackerArrivalAt: "2026-09-24T08:00:00.000Z",
      trackerArrivalDistanceMeters: 405,
      trackerArrivalCandidateAt: "2026-09-24T07:58:00.000Z",
      trackerArrivalCandidateDistanceMeters: 430,
      arrivalProofReminderSentAt: "2026-09-24T08:16:00.000Z"
    })]);
    listCalendarEvents.mockResolvedValue([
      calendarEvent([
        "Name: Client One",
        "Email: client@example.com",
        "Phone: 07111222333",
        "Pickup: New pickup after calendar edit",
        "Delivery: Old dropoff"
      ].join("\n"))
    ]);

    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0]).toEqual(expect.objectContaining({
      pickup: "New pickup after calendar edit",
      pickupLocation: undefined,
      onMyWayAt: "2026-09-24T07:45:00.000Z",
      gpsliveImei: "123456789012345",
      trackerArrivalAt: undefined,
      trackerArrivalDistanceMeters: undefined,
      trackerArrivalCandidateAt: undefined,
      trackerArrivalCandidateDistanceMeters: undefined,
      arrivalProofReminderSentAt: undefined
    }));
  });

  it("reactivates a cancelled job when the Calendar event exists again as confirmed", async () => {
    const movedStart = "2026-09-25T07:30:00+01:00";
    const movedFinish = "2026-09-25T09:30:00+01:00";
    listJobs.mockResolvedValue([existingJob({
      status: JobStatus.CANCELLED,
      currentState: "CANCELLED",
      bookedStart: "2026-09-24T07:30:00+01:00",
      bookedFinish: "2026-09-24T09:30:00+01:00"
    })]);
    listCalendarEvents.mockResolvedValue([{
      ...calendarEvent([
        "Name: Client One",
        "Email: client@example.com",
        "Phone: 07111222333",
        "Pickup: Old pickup",
        "Delivery: Old dropoff"
      ].join("\n")),
      start: { dateTime: movedStart },
      end: { dateTime: movedFinish }
    }]);

    await syncBookingsForDate(DateTime.fromISO("2026-09-25T12:00:00", { zone: "Europe/London" }));

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0]).toEqual(expect.objectContaining({
      bookedStart: movedStart,
      bookedFinish: movedFinish,
      status: JobStatus.READY,
      currentState: WorkflowState.READY
    }));
  });

  it("stores pickup and drop-off coordinates resolved during Calendar sync", async () => {
    geocodeAddress.mockResolvedValue({ lat: 51.5394, lng: -0.1027 });
    listJobs.mockResolvedValue([]);
    listCalendarEvents.mockResolvedValue([
      calendarEvent([
        "Name: Client One",
        "Email: client@example.com",
        "Phone: 07111222333",
        "Pickup: 7 Larch Close, London N1 7DP",
        "Delivery: Old dropoff"
      ].join("\n"))
    ]);

    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));

    expect(geocodeAddress).toHaveBeenCalledWith("7 Larch Close, London N1 7DP");
    expect(geocodeAddress).toHaveBeenCalledWith("Old dropoff");
    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0]).toEqual(expect.objectContaining({
      pickup: "7 Larch Close, London N1 7DP",
      pickupLocation: { lat: 51.5394, lng: -0.1027 }, dropoffLocation: { lat: 51.5394, lng: -0.1027 }
    }));
  });

  it("preserves billing snapshots, rates, payment splits and timing provenance during Calendar edits", async () => {
    const current = existingJob({ actualStart: bookedStart, actualFinish: "2026-09-24T12:30:00+01:00", extraChargeText: "GBP 55 per half hour" });
    current.timeBilling = {
      ...calculateJobTimeBilling({ bookedStart, bookedFinish, actualStart: bookedStart, actualFinish: current.actualFinish, rate: { per30Pence: pence(5500), source: "calendar" }, partialBlockPolicy: "round-up" }),
      rateResolution: { rate: { per30Pence: pence(5500), source: "calendar" }, settingKey: null, calendarText: current.extraChargeText, calendarStatus: "valid", needsVerification: false },
      driverInitials: "MI", capturedAt: "2026-09-24T12:31:00+01:00"
    };
    current.chargeSnapshot = { basePence: 17500, congestionPence: 1800, tunnelPence: 1360 };
    current.roadTariffSnapshot = { version: "tmv-customer-road-v1", effectiveFrom: "2026-09-24T06:00:00Z", capturedAt: "2026-09-24T06:00:00Z", source: "pricing-settings", congestionPence: 1800, tunnelPence: 1360 };
    current.paymentBreakdown = [{ method: "Cash", amount: 100 }, { method: "Card", amount: 50 }];
    current.actualFinishSource = "empty-van-photo";
    listJobs.mockResolvedValue([current]);
    listCalendarEvents.mockResolvedValue([calendarEvent("Name: Changed client\nAny extra charge: GBP 999 per hour")]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));
    const saved = upsertJob.mock.calls[0][0];
    expect(saved).toMatchObject({ extraChargeText: "GBP 55 per half hour", actualFinishSource: "empty-van-photo", chargeSnapshot: current.chargeSnapshot, paymentBreakdown: current.paymentBreakdown });
    expect(saved.timeBilling).toEqual(current.timeBilling);
    expect(saved.roadTariffSnapshot).toEqual(current.roadTariffSnapshot);
  });

  it("re-reads under the job lock so a stale sync cannot erase newly saved billing or payments", async () => {
    const stale = existingJob();
    const latest = existingJob({
      actualStart: bookedStart, actualFinish: bookedFinish,
      currentState: WorkflowState.WAITING_PAYMENT,
      chargeSnapshot: { basePence: 17500, congestionPence: 1800, tunnelPence: 0 },
      calculatedTotalCharges: 193, amountCharged: 193, timeBillingStatus: "verified",
      extraChargeText: "GBP 55 per half hour", paymentBreakdown: [{ method: "Cash", amount: 193 }]
    });
    listJobs.mockResolvedValue([stale]);
    getJob.mockResolvedValue(latest);
    listCalendarEvents.mockResolvedValue([calendarEvent("Name: Changed client\nAny extra charge: GBP 999 per hour")]);
    await syncBookingsForDate(DateTime.fromISO("2026-09-24T12:00:00", { zone: "Europe/London" }));
    expect(upsertJob.mock.calls[0][0]).toMatchObject({
      currentState: WorkflowState.WAITING_PAYMENT, chargeSnapshot: latest.chargeSnapshot,
      calculatedTotalCharges: 193, extraChargeText: "GBP 55 per half hour", paymentBreakdown: latest.paymentBreakdown
    });
  });
});
