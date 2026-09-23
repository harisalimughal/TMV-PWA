import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const appendActivity = vi.fn().mockResolvedValue(undefined);
const readEvidenceSummary = vi.fn();
const getDriverProfileByInitials = vi.fn();
const sendOpsJobCompletionEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));

vi.mock("../src/db/activity.repo", () => ({
  appendActivity: (...args: any[]) => appendActivity(...args)
}));

vi.mock("../src/db/evidence.repo", () => ({
  readEvidenceSummary: (...args: any[]) => readEvidenceSummary(...args)
}));

vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfileByInitials: (...args: any[]) => getDriverProfileByInitials(...args)
}));

vi.mock("../src/google/gmail", () => ({
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: (...args: any[]) => sendOpsJobCompletionEmail(...args)
}));

import { markJobFinishedManually } from "../src/admin/dashboard/manual-finish";

function baseJob(overrides: Partial<Job> = {}): Job {
  const bookedStart = "2026-09-23T09:00:00.000Z";
  const bookedFinish = "2026-09-23T11:00:00.000Z";
  return {
    jobId: "TMV-MANUAL",
    calendarEventId: "cal-manual",
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
    basePrice: 12000,
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
    totalCharges: 12000,
    amountCharged: 12000,
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
    createdAt: bookedStart,
    updatedAt: bookedStart,
    ...overrides
  };
}

describe("markJobFinishedManually", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockResolvedValue(baseJob());
    readEvidenceSummary.mockResolvedValue({ completed: {}, pending: {}, failed: {}, hasSignature: false });
    getDriverProfileByInitials.mockResolvedValue({
      initials: "HE",
      fullName: "Haris Example",
      email: "driver@example.com",
      chatUserName: "",
      active: true,
      role: "Driver",
      phone: "",
      vanRegistration: "AB12 CDE",
      imei: ""
    });
  });

  it("marks a non-finished job completed without changing evidence state", async () => {
    const completed = await markJobFinishedManually("TMV-MANUAL", "Driver completed this manually.");

    expect(completed.status).toBe(JobStatus.COMPLETED);
    expect(completed.currentState).toBe(WorkflowState.COMPLETED);
    expect(completed.actualFinish).toEqual(expect.any(String));
    expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-MANUAL",
      status: JobStatus.COMPLETED,
      currentState: WorkflowState.COMPLETED,
      signatureUrl: ""
    }));
    expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-MANUAL",
      driver: "admin dashboard",
      action: "ADMIN_MARKED_COMPLETED",
      fromState: WorkflowState.WAITING_EMPTY_VAN_PHOTO,
      toState: WorkflowState.COMPLETED,
      detail: "Driver completed this manually."
    }));
  });

  it("does not rewrite an already completed job", async () => {
    getJob.mockResolvedValue(baseJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED }));

    await markJobFinishedManually("TMV-MANUAL", "Already done");

    expect(upsertJob).not.toHaveBeenCalled();
    expect(appendActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "ADMIN_MARKED_COMPLETED" }));
  });
});
