import { describe, expect, it, vi, beforeEach } from "vitest";
import { JobStatus } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getJob = vi.fn();
const listJobs = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const getDriverProfile = vi.fn();
const appendActivity = vi.fn().mockResolvedValue(undefined);
const listActivityForJob = vi.fn().mockResolvedValue([]);
const getSetting = vi.fn().mockResolvedValue("On my way {vanRegistration}");
const sendJobStartedSms = vi.fn().mockResolvedValue(undefined);
const sendJobStartedEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/config/env", () => ({
  env: {
    timezone: "Europe/London",
    calendarSyncTtlMs: 120_000,
    firetextApiKey: "firetext-key",
    firetextSenderId: "TheManVan"
  }
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));
vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));
vi.mock("../src/db/activity.repo", () => ({
  appendActivity: (...args: any[]) => appendActivity(...args),
  listActivityForJob: (...args: any[]) => listActivityForJob(...args)
}));
vi.mock("../src/db/settings.repo", () => ({
  getSetting: (...args: any[]) => getSetting(...args)
}));
vi.mock("../src/integrations/firetext", () => ({
  sendJobStartedSms: (...args: any[]) => sendJobStartedSms(...args)
}));
vi.mock("../src/google/gmail", () => ({
  sendJobStartedEmail: (...args: any[]) => sendJobStartedEmail(...args)
}));

import { sendOnMyWay, startJob } from "../src/jobs/jobs.service";

const driver = {
  initials: "AB",
  fullName: "Abi Driver",
  email: "abi@example.com",
  chatUserName: "",
  active: true,
  role: "Driver",
  phone: "07123456789",
  vanRegistration: "AB12 CDE"
};

function job(overrides: Partial<any> = {}) {
  return {
    jobId: "TMV-SMS",
    driverInitials: "AB",
    customerName: "Client",
    customerPhone: "07111 222333",
    customerEmail: "client@example.com",
    bookedStart: new Date().toISOString(),
    bookedFinish: new Date(Date.now() + 60 * 60_000).toISOString(),
    status: JobStatus.READY,
    currentState: WorkflowState.READY,
    ...overrides
  };
}

describe("sendOnMyWay SMS notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfile.mockResolvedValue(driver);
    listActivityForJob.mockResolvedValue([]);
  });

  it("sends the customer SMS and stamps onMyWayAt when notifying a not-yet-notified job", async () => {
    const readyJob = job();
    getJob.mockResolvedValue(readyJob);

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    await vi.waitFor(() => expect(sendJobStartedSms).toHaveBeenCalledTimes(1));
    expect(getSetting).toHaveBeenCalledWith("JOB_STARTED_MESSAGE_TEXT", expect.any(String));
    expect(sendJobStartedSms).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-SMS", onMyWayAt: expect.any(String) }),
      "On my way {vanRegistration}",
      driver
    );
    await vi.waitFor(() => expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-SMS",
      action: "CLIENT_JOB_STARTED_SMS_SENT",
      detail: "07111 222333"
    })));
  });

  it("does not resend SMS for a job that's already been notified", async () => {
    getJob.mockResolvedValue(job({ onMyWayAt: new Date().toISOString() }));

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    expect(sendJobStartedSms).not.toHaveBeenCalled();
  });
});

describe("sendOnMyWay email notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfile.mockResolvedValue(driver);
    listActivityForJob.mockResolvedValue([]);
  });

  it("sends the customer a driver-introduction email alongside the SMS", async () => {
    const readyJob = job();
    getJob.mockResolvedValue(readyJob);

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    await vi.waitFor(() => expect(sendJobStartedEmail).toHaveBeenCalledTimes(1));
    expect(sendJobStartedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-SMS", onMyWayAt: expect.any(String) }),
      "On my way {vanRegistration}",
      driver
    );
    // isMessageEnabled's own getSetting() check adds one more promise hop before
    // sendJobStartedEmail fires, so the SENT activity write can still be pending a
    // microtask after the assertion above -- wait for it directly rather than assuming
    // it landed already.
    await vi.waitFor(() => expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-SMS",
      action: "CLIENT_JOB_STARTED_EMAIL_SENT",
      detail: "client@example.com"
    })));
  });

  it("uses the email-specific template separately from the SMS template", async () => {
    getSetting.mockImplementation((key: string, fallback: string) => {
      if (key === "JOB_STARTED_MESSAGE_TEXT") return Promise.resolve("SMS only {vanRegistration}");
      if (key === "JOB_STARTED_EMAIL_MESSAGE_TEXT") return Promise.resolve("Email only {driver_name}");
      return Promise.resolve(fallback);
    });
    getJob.mockResolvedValue(job());

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    await vi.waitFor(() => expect(sendJobStartedSms).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(sendJobStartedEmail).toHaveBeenCalledTimes(1));
    expect(sendJobStartedSms).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-SMS" }),
      "SMS only {vanRegistration}",
      driver
    );
    expect(sendJobStartedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "TMV-SMS" }),
      "Email only {driver_name}",
      driver
    );
  });

  it("skips the email (but still sends SMS) when the booking has no customer email", async () => {
    getJob.mockResolvedValue(job({ customerEmail: "" }));

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    await vi.waitFor(() => expect(sendJobStartedSms).toHaveBeenCalledTimes(1));
    expect(sendJobStartedEmail).not.toHaveBeenCalled();
    expect(appendActivity).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "TMV-SMS",
      action: "CLIENT_JOB_STARTED_EMAIL_SKIPPED"
    }));
  });

  it("does not resend the email for a job that's already been notified", async () => {
    getJob.mockResolvedValue(job({ onMyWayAt: new Date().toISOString() }));

    await sendOnMyWay("TMV-SMS", "abi@example.com");

    expect(sendJobStartedEmail).not.toHaveBeenCalled();
  });
});

describe("startJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfile.mockResolvedValue(driver);
    listActivityForJob.mockResolvedValue([]);
  });

  it("refuses to start a job the driver hasn't sent \"I'm on the Way\" for yet", async () => {
    getJob.mockResolvedValue(job());

    await expect(startJob("TMV-SMS", "abi@example.com")).rejects.toThrow(
      "Tap \"I'm on the Way\" first"
    );
    expect(sendJobStartedSms).not.toHaveBeenCalled();
    expect(sendJobStartedEmail).not.toHaveBeenCalled();
  });

  it("starts the job without messaging the customer once onMyWayAt is already set", async () => {
    getJob.mockResolvedValue(job({ onMyWayAt: new Date().toISOString() }));

    const started = await startJob("TMV-SMS", "abi@example.com");

    expect(started.status).toBe(JobStatus.IN_PROGRESS);
    expect(sendJobStartedSms).not.toHaveBeenCalled();
    expect(sendJobStartedEmail).not.toHaveBeenCalled();
  });

  it("does not resend for a job that is already in progress", async () => {
    getJob.mockResolvedValue(job({
      status: JobStatus.IN_PROGRESS,
      currentState: WorkflowState.WAITING_ARRIVAL_PHOTO
    }));

    await startJob("TMV-SMS", "abi@example.com");

    expect(sendJobStartedSms).not.toHaveBeenCalled();
    expect(sendJobStartedEmail).not.toHaveBeenCalled();
  });
});
