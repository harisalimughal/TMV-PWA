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
  sendOpsJobCompletionEmail: vi.fn(),
  sendOpsVanLoadedEmail: vi.fn().mockResolvedValue(undefined),
  sendOpsVanUnloadedEmail: vi.fn().mockResolvedValue(undefined),
  sendOpsCustomerSignedEmail: vi.fn().mockResolvedValue(undefined)
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
    actualFinish: "2026-09-24T11:00:00.000Z",
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
        PACKING_BILLING_UNIT: "Per hour"
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
      extraCharges: [ExtraChargeType.EXTRA_TIME],
      extraRequest: "Full packing service required",
      actualFinish: "2026-09-24T12:00:00.000Z",
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
      extraChargeText: "£75 PER HALF AN HOUR",
      actualFinish: "2026-09-24T12:00:00.000Z"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["60"] }
    );

    expect(updated.overtimeCharge).toBe(150);
  });

  it("normalizes hourly Calendar rates and bills full half-hour blocks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:30:00.000Z"));

    getJob.mockResolvedValue(job({
      extraCharges: [ExtraChargeType.EXTRA_TIME],
      extraChargeText: "Any extra charges: 120 pounds per hr",
      actualFinish: "2026-09-24T12:30:00.000Z"
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
      extraChargeText: "Any extra charge: £100 per hour",
      actualFinish: "2026-09-24T11:30:00.000Z"
    }));

    const updated = await handleAction(
      "SUBMIT_OVERTIME",
      "TMV-PRICE",
      "abi@example.com",
      { overtime_minutes: ["30"] }
    );

    expect(updated.overtimeCharge).toBe(50);
  });

  it.each([[90, 0], [120, 0], [150, 55], [180, 110], [210, 165], [240, 220], [121, 55], [149, 55], [151, 110]])(
    "bills a 90-minute booking completed in %i minutes at GBP %i even without selecting extra time", async (actual, expected) => {
      const current = job({
        bookedFinish: "2026-09-24T10:30:00Z", bookedMinutes: 90,
        actualFinish: new Date(Date.parse("2026-09-24T09:00:00Z") + actual * 60_000).toISOString(),
        extraChargeText: "GBP 55 per half hour", currentState: WorkflowState.WAITING_EXTRA_CHARGES
      });
      getJob.mockResolvedValue(current);
      const afterExtras = await handleAction("SUBMIT_EXTRA_CHARGES", "TMV-PRICE", "abi@example.com", { extra_charges: [ExtraChargeType.NONE] });
      expect(afterExtras.currentState).toBe(WorkflowState.WAITING_TOTAL_CHARGES);
      expect(afterExtras.overtimeCharge).toBe(expected);
      const afterTotal = await handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {});
      expect(afterTotal.amountCharged).toBe(100 + expected);
      expect(afterTotal.timeBilling).toMatchObject({ scheduledMinutes: 90, allocatedMinutes: 120, actualMinutes: actual, extraChargePence: expected * 100 });
    }
  );

  it("saves driver-reported time independently without charging overreported time", async () => {
    getJob.mockResolvedValue(job({ extraCharges: [ExtraChargeType.EXTRA_TIME] }));
    const updated = await handleAction("SUBMIT_OVERTIME", "TMV-PRICE", "abi@example.com", { overtime_minutes: ["180"], overtime_crew_size: ["3"] });
    expect(updated).toMatchObject({ overtimeMinutes: 0, overtimeCharge: 0, driverReportedOvertimeMinutes: 180, driverReportedOvertimeCrewSize: 3 });
    expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "OVERTIME_RECONCILED" }));
  });

  it("freezes timing, rate and total before payment despite later clock/settings changes", async () => {
    const current = job({ actualFinish: "2026-09-24T11:01:00Z", currentState: WorkflowState.WAITING_TOTAL_CHARGES });
    getJob.mockResolvedValue(current);
    const updated = await handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {});
    const saved = JSON.stringify(updated.timeBilling);
    getSetting.mockResolvedValue("999");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    expect(await suggestedTotal(updated)).toBe(155);
    updated.currentState = WorkflowState.WAITING_TOTAL_CHARGES;
    await handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {});
    expect(updated.amountCharged).toBe(155);
    expect(JSON.stringify(updated.timeBilling)).toBe(saved);
  });

  it("requires recorded finish evidence before accepting an automatic total", async () => {
    getJob.mockResolvedValue(job({ actualFinish: "", currentState: WorkflowState.WAITING_TOTAL_CHARGES }));
    await expect(handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {})).rejects.toThrow("Recorded arrival");
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("requires verification for an unusable settings rate when overtime exists", async () => {
    getSetting.mockResolvedValue("invalid");
    getJob.mockResolvedValue(job({ actualFinish: "2026-09-24T11:01:00Z", currentState: WorkflowState.WAITING_TOTAL_CHARGES }));
    await expect(handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {})).rejects.toThrow("rate needs administrative verification");
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("retains the accepted total on legacy payment jobs", async () => {
    const current = job({ currentState: WorkflowState.WAITING_PAYMENT, overtimeCharge: 75, calculatedTotalCharges: 175, totalCharges: 175 });
    getJob.mockResolvedValue(current);
    expect(await suggestedTotal(current)).toBe(175);
    await handleAction("GO_BACK", "TMV-PRICE", "abi@example.com", {});
    await handleAction("SUBMIT_TOTAL_CHARGES", "TMV-PRICE", "abi@example.com", {});
    expect(current.amountCharged).toBe(175);
    expect(current.timeBilling).toBeUndefined();
    expect(current.timeBillingStatus).toBe("legacy");
  });

  it("returns a completed job on completion retries without repricing or another write", async () => {
    getJob.mockResolvedValue(job({ status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED, totalCharges: 175 }));
    const retried = await handleAction("COMPLETE_JOB", "TMV-PRICE", "abi@example.com", {});
    expect(retried.totalCharges).toBe(175);
    expect(upsertJob).not.toHaveBeenCalled();
    expect(getSetting).not.toHaveBeenCalled();
  });
});
