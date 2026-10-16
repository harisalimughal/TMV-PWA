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
vi.mock("../src/db/settings.repo", () => ({
  getSetting: vi.fn(async (_key: string, fallback: string) => fallback)
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
    await vi.waitFor(() => expect(sendOpsJobCompletionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-MANUAL" }), expect.any(Object), expect.any(Object), "admin"
    ));
  });

  it("does not rewrite an already completed job", async () => {
    getJob.mockResolvedValue(baseJob({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED }));

    await markJobFinishedManually("TMV-MANUAL", "Already done");

    expect(upsertJob).not.toHaveBeenCalled();
    expect(appendActivity).not.toHaveBeenCalledWith(expect.objectContaining({ action: "ADMIN_MARKED_COMPLETED" }));
  });

  it("preserves the empty-van finish time and calculates overtime from the recorded move", async () => {
    getJob.mockResolvedValue(baseJob({
      bookedFinish: "2026-09-23T10:30:00Z", bookedMinutes: 90,
      actualStart: "2026-09-23T09:00:00Z", actualFinish: "2026-09-23T11:30:00Z",
      extraChargeText: "GBP 55 per half hour", basePrice: 100
    }));
    const completed = await markJobFinishedManually("TMV-MANUAL", "Confirmed finish");
    expect(completed).toMatchObject({ actualFinish: "2026-09-23T11:30:00Z", overtimeCharge: 55, totalCharges: 155 });
    expect(completed.timeBilling).toMatchObject({ actualMinutes: 150, allocatedMinutes: 120, billedExtraBlocks: 1 });
    getJob.mockResolvedValue(completed);
    upsertJob.mockClear();
    await markJobFinishedManually("TMV-MANUAL", "Retry");
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("labels fallback timing unverifiable and retains saved charges", async () => {
    const completed = await markJobFinishedManually("TMV-MANUAL", "Missing evidence");
    expect(completed).toMatchObject({ timeBillingStatus: "needs-verification", actualStartSource: "completion-fallback", actualFinishSource: "admin-manual", totalCharges: 12000 });
    expect(completed.timeBilling).toBeUndefined();
  });

  it("keeps invalid recorded timing finite and flagged instead of saving NaN", async () => {
    getJob.mockResolvedValue(baseJob({ actualStart: "invalid", actualFinish: "2026-09-23T11:00:00Z" }));
    const completed = await markJobFinishedManually("TMV-MANUAL", "Verify times");
    expect(completed.actualMinutes).toBe(0);
    expect(completed.timeBillingStatus).toBe("needs-verification");
    expect(completed.timeBilling).toBeUndefined();
  });
});
