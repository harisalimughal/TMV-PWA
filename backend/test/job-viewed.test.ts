import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const listJobs = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const appendActivity = vi.fn().mockResolvedValue(undefined);
const listActivityForJob = vi.fn();
const getDriverProfile = vi.fn();

vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));

vi.mock("../src/db/activity.repo", () => ({
  appendActivity: (...args: any[]) => appendActivity(...args),
  listActivityForJob: (...args: any[]) => listActivityForJob(...args)
}));

vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));

vi.mock("../src/google/gmail", () => ({
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: vi.fn()
}));

vi.mock("../src/integrations/firetext", () => ({
  sendJobStartedSms: vi.fn()
}));

import { markJobViewed } from "../src/jobs/jobs.service";

function baseJob(overrides: Partial<Job> = {}): Job {
  const bookedStart = "2026-09-23T09:00:00.000Z";
  const bookedFinish = "2026-09-23T11:00:00.000Z";
  return {
    jobId: "TMV-VIEW",
    calendarEventId: "cal-view",
    driverInitials: "HE",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "07123456789",
    pickup: "1 Pickup Street",
    dropoff: "2 Dropoff Road",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 120,
    paidOnline: false,
    bookedStart,
    bookedFinish,
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 120,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 120,
    paymentMethod: "",
    paymentStatus: "",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    driveFolderId: "",
    driveFolderUrl: "",
    status: JobStatus.READY,
    currentState: WorkflowState.READY,
    rawTitle: "",
    rawDescription: "",
    createdAt: bookedStart,
    updatedAt: bookedStart,
    ...overrides
  };
}

describe("markJobViewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(baseJob());
    getDriverProfile.mockResolvedValue({
      initials: "HE",
      fullName: "Haris Example",
      email: "driver@example.com",
      chatUserName: "",
      active: true,
      role: "Driver",
      phone: "",
      vanRegistration: "",
      imei: ""
    });
    listActivityForJob.mockResolvedValue([]);
  });

  it("records DRIVER_VIEWED_JOB the first time a driver intentionally opens or interacts with a job", async () => {
    await markJobViewed("TMV-VIEW", "driver@example.com", "opened job");

    expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-VIEW",
      driver: "driver@example.com",
      action: "DRIVER_VIEWED_JOB",
      detail: "opened job"
    }));
  });

  it("does not record duplicate viewed activity for the same driver and job", async () => {
    listActivityForJob.mockResolvedValue([
      {
        jobId: "TMV-VIEW",
        driver: "driver@example.com",
        action: "DRIVER_VIEWED_JOB",
        timestamp: "2026-09-23T09:05:00.000Z"
      }
    ]);

    await markJobViewed("TMV-VIEW", "driver@example.com", "opened again");

    expect(appendActivity).not.toHaveBeenCalled();
  });
});
