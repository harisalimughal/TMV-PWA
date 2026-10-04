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
const sendOpsVanLoadedEmail = vi.fn().mockResolvedValue(undefined);
const sendReviewRequestEmail = vi.fn().mockResolvedValue(undefined);

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
  sendReviewRequestEmail: (...args: any[]) => sendReviewRequestEmail(...args),
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: vi.fn(),
  sendOpsVanLoadedEmail: (...args: any[]) => sendOpsVanLoadedEmail(...args),
  sendOpsVanUnloadedEmail: vi.fn().mockResolvedValue(undefined),
  sendOpsCustomerSignedEmail: vi.fn().mockResolvedValue(undefined)
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

  it("moves from arrival photo straight to van loaded photo", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_ARRIVAL_PHOTO }));

    const updated = await handlePhotoStep("TMV-FLOW", "abi@example.com", [
      { buffer: Buffer.from("image"), contentType: "image/jpeg", fileName: "arrival.jpg" }
    ]);

    expect(updated.currentState).toBe(WorkflowState.WAITING_LOADED_PHOTO);
  });

  it("moves from van loaded photo straight to empty van photo", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_LOADED_PHOTO }));

    const updated = await handlePhotoStep("TMV-FLOW", "abi@example.com", [
      { buffer: Buffer.from("image"), contentType: "image/jpeg", fileName: "loaded.jpg" }
    ]);

    expect(updated.currentState).toBe(WorkflowState.WAITING_EMPTY_VAN_PHOTO);
  });

  it("sends a best-effort ops email after van loaded photos are accepted", async () => {
    getJob.mockResolvedValue(job({
      currentState: WorkflowState.WAITING_LOADED_PHOTO,
      customerName: "Mary Major"
    }));

    await handlePhotoStep("TMV-FLOW", "abi@example.com", [
      { buffer: Buffer.from("image"), contentType: "image/jpeg", fileName: "loaded.jpg" }
    ]);

    await vi.waitFor(() => expect(sendOpsVanLoadedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-FLOW", customerName: "Mary Major" }),
      expect.objectContaining({ fullName: "Abi Driver", email: "abi@example.com" })
    ));
    await vi.waitFor(() => expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-FLOW",
      action: "OPS_VAN_LOADED_EMAIL_SENT",
      detail: "info@themanvan.co.uk"
    })));
  });

  it("does not send the van-loaded ops email for other photo steps", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_ARRIVAL_PHOTO }));

    await handlePhotoStep("TMV-FLOW", "abi@example.com", [
      { buffer: Buffer.from("image"), contentType: "image/jpeg", fileName: "arrival.jpg" }
    ]);

    expect(sendOpsVanLoadedEmail).not.toHaveBeenCalled();
  });

  it("recovers old jobs already parked on the removed stop-by check", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_STOP_BY_CHECK }));

    const updated = await handleAction("ISSUES_NONE", "TMV-FLOW", "abi@example.com", {});

    expect(updated.currentState).toBe(WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK);
  });

  it("moves from customer signature to extra charges before total and payment", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_CLIENT_CONFIRMATION }));

    const updated = await submitDrawnSignature("TMV-FLOW", "abi@example.com", "Client", "https://example.com/sig.png");

    expect(updated.currentState).toBe(WorkflowState.WAITING_EXTRA_CHARGES);
  });

  it("records when the customer final signature is captured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:34:56.000Z"));
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_CLIENT_CONFIRMATION }));

    try {
      const updated = await submitDrawnSignature("TMV-FLOW", "abi@example.com", "Client", "https://example.com/sig.png");

      expect(updated.clientSignatureAt).toBe("2026-09-24T12:34:56.000Z");
      expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({
        clientSignatureAt: "2026-09-24T12:34:56.000Z"
      }));
    } finally {
      vi.useRealTimers();
    }
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
      payment_method: [PaymentMethod.CARD],
      payment_amount_Card: [String(afterTotal.amountCharged)]
    });
    const afterPaymentState = afterPayment.currentState;

    expect(afterChargesState).toBe(WorkflowState.WAITING_TOTAL_CHARGES);
    expect(afterTotalState).toBe(WorkflowState.WAITING_PAYMENT);
    expect(afterPaymentState).toBe(WorkflowState.WAITING_REVIEW_CHECK);
  });

  it("stores payment amounts for paid methods and leaves invoice as outstanding", async () => {
    getJob.mockResolvedValue(job({
      currentState: WorkflowState.WAITING_PAYMENT,
      amountCharged: 150
    }));

    const updated = await handleAction("SUBMIT_PAYMENT", "TMV-FLOW", "abi@example.com", {
      payment_method: [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.INVOICE],
      payment_amount_Card: ["80"],
      payment_amount_Cash: ["20"]
    });

    expect(updated.paymentMethod).toBe("Card, Cash, Invoice");
    expect(updated.paymentStatus).toBe("Outstanding");
    expect(updated.paymentBreakdown).toEqual([
      { method: "Card", amount: 80 },
      { method: "Cash", amount: 20 },
      { method: "Invoice", amount: 0 }
    ]);
  });

  it("allows payment amounts to differ from the final amount charged", async () => {
    getJob.mockResolvedValue(job({
      currentState: WorkflowState.WAITING_PAYMENT,
      amountCharged: 150
    }));

    const updated = await handleAction("SUBMIT_PAYMENT", "TMV-FLOW", "abi@example.com", {
      payment_method: [PaymentMethod.CARD, PaymentMethod.CASH],
      payment_amount_Card: ["80"],
      payment_amount_Cash: ["20"]
    });

    expect(updated.currentState).toBe(WorkflowState.WAITING_REVIEW_CHECK);
    expect(updated.paymentStatus).toBe("Recorded");
    expect(updated.paymentBreakdown).toEqual([
      { method: "Card", amount: 80 },
      { method: "Cash", amount: 20 }
    ]);
  });

  it("records Review Report Yes only after the review email is sent", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_REVIEW_CHECK }));

    const updated = await handleAction("REVIEW_YES", "TMV-FLOW", "abi@example.com", {});

    expect(sendReviewRequestEmail).toHaveBeenCalled();
    expect(updated.reviewEmailSent).toBe(true);
    expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({ reviewEmailSent: true }));
  });

  it("records Review Report No when the driver declines the review email", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_REVIEW_CHECK }));

    const updated = await handleAction("REVIEW_NONE", "TMV-FLOW", "abi@example.com", {});

    expect(sendReviewRequestEmail).not.toHaveBeenCalled();
    expect(updated.reviewEmailSent).toBe(false);
    expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({ reviewEmailSent: false }));
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

  it("goes back from empty van photo to van loaded photo", async () => {
    getJob.mockResolvedValue(job({ currentState: WorkflowState.WAITING_EMPTY_VAN_PHOTO }));

    const updated = await handleAction("GO_BACK", "TMV-FLOW", "abi@example.com", {});

    expect(updated.currentState).toBe(WorkflowState.WAITING_LOADED_PHOTO);
  });
});
