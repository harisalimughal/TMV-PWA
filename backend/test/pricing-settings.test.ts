import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtraChargeType, JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const getDriverProfile = vi.fn();
const appendActivity = vi.fn().mockResolvedValue(undefined);
const getSetting = vi.fn();
const sendReviewRequestEmail = vi.fn().mockResolvedValue(undefined);
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
vi.mock("../src/google/gmail", () => ({
  sendReviewRequestEmail: (...args: any[]) => sendReviewRequestEmail(...args),
  sendJobStartedEmail: vi.fn(),
  sendOpsJobCompletionEmail: vi.fn()
}));
vi.mock("../src/push/push.service", () => ({
  sendPushToAdmins: (...args: any[]) => sendPushToAdmins(...args)
}));

import { handleAction, suggestedTotal } from "../src/workflow/workflow.engine";

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
  const bookedFinish = "2026-09-24T11:00:00.000Z";
  return {
    jobId: "TMV-PRICE",
    calendarEventId: "cal-price",
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
    bookedFinish,
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
    currentState: WorkflowState.WAITING_OVERTIME,
    rawTitle: "",
    rawDescription: "",
    createdAt: bookedStart,
    updatedAt: bookedStart,
    ...overrides
  };
}

describe("pricing settings enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfile.mockResolvedValue(driver);
    getSetting.mockImplementation((key: string, fallback: string) => {
      const values: Record<string, string> = {
        CONGESTION_CHARGE: "20",
        TUNNEL_CHARGE: "15",
        PACKING_RATE: "95",
        CREW_RATE_2_MAN: "55",
        OVERTIME_GRACE_MINS: "0",
        OVERTIME_RATE_PER_30: "",
        CREW_BILLING_UNIT: "Per 30 minutes",
        PACKING_BILLING_UNIT: "Per 30 minutes"
      };
      return Promise.resolve(values[key] ?? fallback);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses dashboard congestion and tunnel charges in the suggested total", async () => {
    const total = await suggestedTotal(job({
      extraCharges: [ExtraChargeType.CONGESTION, ExtraChargeType.TUNNEL]
    }));

    expect(total).toBe(135);
  });

  it("uses the dashboard full/packing rate per half hour when packing is mentioned in the calendar booking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));

    getJob.mockResolvedValue(job({
      extraCharges: [ExtraChargeType.EXTRA_TIME, ExtraChargeType.PACKING],
      extraRequest: "Full packing service required",
      rawDescription: "PACKING service requested"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["60"] }
    );

    expect(updated.overtimeCharge).toBe(190);
    expect(upsertJob).toHaveBeenCalledWith(expect.objectContaining({
      overtimeMinutes: 60,
      overtimeCharge: 190
    }));
  });

  it("uses the calendar extra-charge rate per half hour before dashboard overtime settings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:00:00.000Z"));

    getJob.mockResolvedValue(job({
      extraCharges: [ExtraChargeType.EXTRA_TIME],
      extraChargeText: "£75 PER HALF AN HOUR"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["60"] }
    );

    expect(updated.overtimeCharge).toBe(150);
  });

  it("prorates calendar extra-charge rates per full hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:30:00.000Z"));

    getJob.mockResolvedValue(job({
      extraCharges: [ExtraChargeType.EXTRA_TIME],
      extraChargeText: "Any extra charges: 120 pounds per hr"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["90"] }
    );

    expect(updated.overtimeCharge).toBe(180);
  });

  it("charges half of a calendar hourly rate for thirty minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:30:00.000Z"));

    getJob.mockResolvedValue(job({
      extraCharges: [ExtraChargeType.EXTRA_TIME],
      extraChargeText: "Any extra charge: £100 per hour"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["30"] }
    );

    expect(updated.overtimeCharge).toBe(50);
  });
});
