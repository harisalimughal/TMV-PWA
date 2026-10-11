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
const notifyDriverJobAssigned = vi.fn().mockResolvedValue(undefined);
const geocodeAddress = vi.fn();

vi.mock("../src/google/calendar", () => ({
  listCalendarEvents: (...args: any[]) => listCalendarEvents(...args)
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
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
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(null);
    geocodeAddress.mockResolvedValue(null);
  });

  it("preserves onMyWayAt when a Calendar resync updates an already-notified job", async () => {
    listJobs.mockResolvedValue([existingJob({
      pickupLocation: { lat: 51.5, lng: -0.14 },
      gpsliveImei: "123456789012345",
      trackerArrivalAt: "2026-09-24T08:00:00.000Z",
      trackerArrivalCandidateAt: "2026-09-24T07:58:00.000Z",
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
      trackerArrivalCandidateAt: undefined,
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

  it("stores pickup coordinates resolved during Calendar sync", async () => {
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
    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0]).toEqual(expect.objectContaining({
      pickup: "7 Larch Close, London N1 7DP",
      pickupLocation: { lat: 51.5394, lng: -0.1027 }
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
