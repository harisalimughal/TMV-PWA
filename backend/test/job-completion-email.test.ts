import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const appendActivity = vi.fn().mockResolvedValue(undefined);
const getDriverProfile = vi.fn();
const readEvidenceSummary = vi.fn();
const sendOpsJobCompletionEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: vi.fn(),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));

vi.mock("../src/db/activity.repo", () => ({
  appendActivity: (...args: any[]) => appendActivity(...args)
}));

vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));

vi.mock("../src/db/evidence.repo", () => ({
  readEvidenceSummary: (...args: any[]) => readEvidenceSummary(...args)
}));

vi.mock("../src/google/gmail", () => ({
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: (...args: any[]) => sendOpsJobCompletionEmail(...args)
}));

import { completeJob } from "../src/jobs/jobs.service";

function baseJob(overrides: Partial<Job> = {}): Job {
  const bookedStart = "2026-09-22T09:00:00.000Z";
  const bookedFinish = "2026-09-22T11:00:00.000Z";
  return {
    jobId: "TMV-123",
    calendarEventId: "cal-123",
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
    actualStart: "2026-09-22T09:15:00.000Z",
    actualFinish: "2026-09-22T11:30:00.000Z",
    bookedMinutes: 120,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "",
    extraCharges: ["No Extras Time"],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 120,
    amountCharged: 120,
    paymentMethod: "Card",
    paymentStatus: "Recorded",
    clientNamePostcode: "",
    clientConfirmedBy: "Jane Doe",
    signatureUrl: "https://example.com/signature.png",
    driveFolderId: "",
    driveFolderUrl: "",
    status: JobStatus.IN_PROGRESS,
    currentState: WorkflowState.WAITING_REVIEW_CHECK,
    rawTitle: "",
    rawDescription: "",
    createdAt: bookedStart,
    updatedAt: bookedStart,
    ...overrides
  };
}

describe("completeJob ops notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    readEvidenceSummary.mockResolvedValue({
      completed: { Arrival: 1, VanLoaded: 2, EmptyVan: 1 },
      pending: {},
      failed: {},
      hasSignature: true
    });
  });

  it("sends a best-effort ops email with a dashboard link after completing a job", async () => {
    getJob.mockResolvedValue(baseJob());

    const completed = await completeJob("TMV-123", "driver@example.com");

    expect(completed.status).toBe(JobStatus.COMPLETED);
    expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-123",
      status: JobStatus.COMPLETED,
      currentState: WorkflowState.COMPLETED
    }));
    await vi.waitFor(() => expect(sendOpsJobCompletionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-123", customerName: "Jane Doe" }),
      expect.objectContaining({ fullName: "Haris Example" }),
      expect.objectContaining({ completed: { Arrival: 1, VanLoaded: 2, EmptyVan: 1 }, hasSignature: true })
    ));
  });
});
