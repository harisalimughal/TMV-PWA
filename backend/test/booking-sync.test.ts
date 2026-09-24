import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const listCalendarEvents = vi.fn();
const listJobs = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const notifyDriverJobAssigned = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/google/calendar", () => ({
  listCalendarEvents: (...args: any[]) => listCalendarEvents(...args)
}));
vi.mock("../src/db/jobs.repo", () => ({
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));
vi.mock("../src/jobs/driver-notify", () => ({
  notifyDriverJobAssigned: (...args: any[]) => notifyDriverJobAssigned(...args)
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
  });

  it("preserves onMyWayAt when a Calendar resync updates an already-notified job", async () => {
    listJobs.mockResolvedValue([existingJob()]);
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
      onMyWayAt: "2026-09-24T07:45:00.000Z"
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
});
