import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";

const mocks = vi.hoisted(() => ({ updateOne: vi.fn(), insertOne: vi.fn(), endSession: vi.fn(), invalidate: vi.fn() }));
const session = { withTransaction: async (work: () => Promise<void>) => work(), endSession: mocks.endSession };
vi.mock("../src/db/mongo", () => ({
  getClient: async () => ({ startSession: () => session }),
  jobsCollection: async () => ({ updateOne: mocks.updateOne, insertOne: mocks.insertOne })
}));
vi.mock("../src/reports/report-read-cache", () => ({ invalidateReportReads: mocks.invalidate }));
import { saveRescheduledAttempt } from "../src/db/jobs.repo";

describe("rescheduled attempt persistence", () => {
  const previous = { jobId: "OLD", status: "COMPLETED", calendarEventId: "event", amountCharged: 175,
    paymentBreakdown: [{ method: "Cash", amount: 175 }], updatedAt: "2026-10-13T10:00:00Z" } as Job;
  const next = { jobId: "NEW", calendarEventId: "reschedule:NEW", sourceCalendarEventId: "event",
    status: "READY", createdAt: "2026-10-16T10:00:00Z", rescheduledFromJobId: "OLD",
    rescheduleNotice: { kind: "admin-completed" } } as Job;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.insertOne.mockResolvedValue({ insertedId: "NEW" });
  });

  it("links the historical completion and inserts the clean attempt in one transaction", async () => {
    await saveRescheduledAttempt(previous, next);
    expect(mocks.updateOne).toHaveBeenCalledWith({ _id: "OLD", status: "COMPLETED", updatedAt: previous.updatedAt,
      rescheduledToJobId: null }, { $set: { rescheduledToJobId: "NEW", rescheduleNotice: next.rescheduleNotice,
      updatedAt: next.createdAt } }, { session });
    expect(mocks.insertOne).toHaveBeenCalledWith({ _id: "NEW", ...next }, { session });
    expect(previous.amountCharged).toBe(175);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.endSession).toHaveBeenCalledTimes(1);
  });

  it("does not create another attempt when the completion has already changed", async () => {
    mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(saveRescheduledAttempt(previous, next)).rejects.toThrow("retry sync");
    expect(mocks.insertOne).not.toHaveBeenCalled();
    expect(mocks.endSession).toHaveBeenCalledTimes(1);
  });
});
