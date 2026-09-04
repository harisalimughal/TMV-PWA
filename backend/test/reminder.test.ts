import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateTime } from "luxon";

const listJobs = vi.fn();
const upsertJob = vi.fn().mockResolvedValue(undefined);
const getDriverProfileByInitials = vi.fn();
const sendJobReminderEmail = vi.fn().mockResolvedValue(undefined);
const sendPushToDriver = vi.fn().mockResolvedValue({ total: 1, sent: 1, failed: 0, pruned: 0 });

vi.mock("../src/db/jobs.repo", () => ({ listJobs: (...args: any[]) => listJobs(...args), upsertJob: (...args: any[]) => upsertJob(...args) }));
vi.mock("../src/auth/driver-account.service", () => ({ getDriverProfileByInitials: (...args: any[]) => getDriverProfileByInitials(...args) }));
vi.mock("../src/google/gmail", () => ({ sendJobReminderEmail: (...args: any[]) => sendJobReminderEmail(...args) }));
vi.mock("../src/push/push.service", () => ({ sendPushToDriver: (...args: any[]) => sendPushToDriver(...args) }));

import { sweepJobReminders } from "../src/jobs/reminder.service";
import { JobStatus } from "../src/jobs/job.types";

function baseJob(overrides: Partial<any> = {}) {
  return {
    jobId: "TMV-TEST",
    driverInitials: "HE",
    customerName: "Jane Doe",
    pickup: "1 Test St",
    dropoff: "2 Test Ave",
    bookedStart: DateTime.now().plus({ minutes: 45 }).toUTC().toISO(),
    status: JobStatus.READY,
    reminderSentAt: undefined,
    ...overrides
  };
}

describe("sweepJobReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDriverProfileByInitials.mockResolvedValue({ initials: "HE", email: "he@example.com", active: true });
  });

  it("sends an email and push for a job due within the reminder window", async () => {
    const job = baseJob();
    listJobs.mockResolvedValue([job]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).toHaveBeenCalledTimes(1);
    expect(sendPushToDriver).toHaveBeenCalledTimes(1);
    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0].reminderSentAt).toBeTruthy();
  });

  it("skips a job whose booked start is more than the lead time away", async () => {
    listJobs.mockResolvedValue([baseJob({ bookedStart: DateTime.now().plus({ hours: 3 }).toUTC().toISO() })]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("skips an old job whose reminder window has already passed", async () => {
    listJobs.mockResolvedValue([baseJob({ bookedStart: DateTime.now().minus({ hours: 3 }).toUTC().toISO() })]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
    expect(upsertJob).not.toHaveBeenCalled();
  });

  it("never reminds the same job twice", async () => {
    listJobs.mockResolvedValue([baseJob({ reminderSentAt: DateTime.now().toUTC().toISO() })]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
  });

  it("skips a job with no driver assigned", async () => {
    listJobs.mockResolvedValue([baseJob({ driverInitials: "" })]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
  });

  it("skips a job that isn't READY (already started, completed or cancelled)", async () => {
    listJobs.mockResolvedValue([baseJob({ status: JobStatus.IN_PROGRESS })]);

    await sweepJobReminders();

    expect(sendJobReminderEmail).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
  });
});
