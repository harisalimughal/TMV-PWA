import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtraChargeType, JobStatus, PaymentMethod, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const getDriverProfile = vi.fn();
const appendActivity = vi.fn().mockResolvedValue(undefined);
const getSetting = vi.fn();
const readEvidenceSummary = vi.fn();
const uploadEvidence = vi.fn().mockResolvedValue(undefined);
const sendPushToAdmins = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));
vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));
vi.mock("../src/db/activity.repo", () => ({
  appendActivity: (...args: any[]) => appendActivity(...args)
}));
vi.mock("../src/db/settings.repo", () => ({
  getSetting: (...args: any[]) => getSetting(...args)
}));
vi.mock("../src/db/evidence.repo", () => ({
  readEvidenceSummary: (...args: any[]) => readEvidenceSummary(...args),
  getEvidence: vi.fn(),
  deleteEvidence: vi.fn()
}));
vi.mock("../src/jobs/evidence.service", () => ({
  uploadEvidence: (...args: any[]) => uploadEvidence(...args)
}));
vi.mock("../src/google/gmail", () => ({
  sendReviewRequestEmail: vi.fn(),
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: vi.fn()
}));
vi.mock("../src/push/push.service", () => ({
  sendPushToAdmins: (...args: any[]) => sendPushToAdmins(...args)
}));

import { handleAction, handlePhotoStep, submitDrawnSignature } from "../src/workflow/workflow.engine";

const driver = {
  initials: "AB",
  fullName: "Abi Driver",
  email: "abi@example.com",
  chatUserName: "",
  active: true,
  role: "Driver",
  phone: "",
  vanRegistration: ""
};

function job(overrides: Partial<Job> = {}): Job {
  const bookedStart = "2026-09-24T09:00:00.000Z";
  return {
    jobId: "TMV-FLOW",
    calendarEventId: "cal-flow",
    driverInitials: "AB",
    customerName: "Client",
    customerEmail: "client@example.com",
    customerPhone: "07123456789",
    pickup: "A",
    dropoff: "B",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 100,
    paidOnline: false,
    bookedStart,
    bookedFinish: "2026-09-24T11:00:00.000Z",
    actualStart: bookedStart,
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
    currentState: WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK,
    rawTitle: "",
    rawDescription: "",
    createdAt: bookedStart,
    updatedAt: bookedStart,
    ...overrides
  };
}

describe("checkout flow order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfile.mockResolvedValue(driver);
    getSetting.mockImplementation((_key: string, fallback: string) => Promise.resolve(fallback));
    readEvidenceSummary.mockResolvedValue({
      completed: { EmptyVan: 1 },
      pending: {},
      failed: {},
      hasSignature: true
    });
  });

  it("moves from drop-off issues to empty van photo before checkout charges", async () => {
    getJob.mockResolvedValue(job());

    const updated = await handleAction("ISSUES_NONE", "TMV-FLOW", "abi@example.com", {});

    expect(updated.currentState).toBe(WorkflowState.WAITING_EMPTY_VAN_PHOTO);
  });

  it("moves from customer signature to extra charges before total and payment", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_CLIENT_CONFIRMATION }));

    const updated = await submitDrawnSignature("TMV-FLOW", "abi@example.com", "Client", "https://example.com/sig.png");

    expect(updated.currentState).toBe(WorkflowState.WAITING_EXTRA_CHARGES);
  });

  it("keeps checkout charges, total charges, payment, then review after sign-off", async () => {
    getJob.mockResolvedValueOnce(job({
      currentState: WorkflowState.WAITING_EXTRA_CHARGES
    }));
    const afterCharges = await handleAction("SUBMIT_EXTRA_CHARGES", "TMV-FLOW", "abi@example.com", {
      extra_charges: [ExtraChargeType.CONGESTION]
    });
    const afterChargesState = afterCharges.currentState;

    getJob.mockResolvedValueOnce(afterCharges);
    const afterTotal = await handleAction("SUBMIT_TOTAL_CHARGES", "TMV-FLOW", "abi@example.com", {});
    const afterTotalState = afterTotal.currentState;

    getJob.mockResolvedValueOnce(afterTotal);
    const afterPayment = await handleAction("SUBMIT_PAYMENT", "TMV-FLOW", "abi@example.com", {
      payment_method: [PaymentMethod.CARD]
    });
    const afterPaymentState = afterPayment.currentState;

    expect(afterChargesState).toBe(WorkflowState.WAITING_TOTAL_CHARGES);
    expect(afterTotalState).toBe(WorkflowState.WAITING_PAYMENT);
    expect(afterPaymentState).toBe(WorkflowState.WAITING_REVIEW_CHECK);
  });

  it("goes back through payment, totals, charges, signature, then empty van photo", async () => {
    getJob.mockResolvedValueOnce(job({ currentState: WorkflowState.WAITING_REVIEW_CHECK }));
    const backToPayment = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});
    const backToPaymentState = backToPayment.currentState;

    getJob.mockResolvedValueOnce(backToPayment);
    const backToTotal = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});
    const backToTotalState = backToTotal.currentState;

    getJob.mockResolvedValueOnce(backToTotal);
    const backToCharges = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});
    const backToChargesState = backToCharges.currentState;

    getJob.mockResolvedValueOnce(backToCharges);
    const backToSignature = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});
    const backToSignatureState = backToSignature.currentState;

    getJob.mockResolvedValueOnce(backToSignature);
    const backToPhoto = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});
    const backToPhotoState = backToPhoto.currentState;

    expect(backToPaymentState).toBe(WorkflowState.WAITING_PAYMENT);
    expect(backToTotalState).toBe(WorkflowState.WAITING_TOTAL_CHARGES);
    expect(backToChargesState).toBe(WorkflowState.WAITING_EXTRA_CHARGES);
    expect(backToSignatureState).toBe(WorkflowState.WAITING_CLIENT_CONFIRMATION);
    expect(backToPhotoState).toBe(WorkflowState.WAITING_EMPTY_VAN_PHOTO);
  });
});
