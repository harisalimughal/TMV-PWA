import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => Promise<unknown>>,
  jobsFind: vi.fn(), activityFind: vi.fn(), dismissed: vi.fn(), error: vi.fn()
}));
vi.mock("express", () => ({ Router: () => ({
  get: (path: string, handler: any) => { mocks.handlers[path] = handler; }, post: vi.fn()
}) }));
vi.mock("../src/db/mongo", () => ({
  jobsCollection: async () => ({ find: mocks.jobsFind }),
  activityCollection: async () => ({ find: mocks.activityFind })
}));
vi.mock("../src/db/dismissals.repo", () => ({ listDismissedIds: mocks.dismissed, dismiss: vi.fn() }));
vi.mock("../src/utils/logger", () => ({ log: { error: mocks.error } }));
import { dashboardNotificationsRoutes } from "../src/admin/dashboard/notifications.routes";

function cursor(rows: unknown[]) {
  const result = { project: vi.fn(), toArray: vi.fn().mockResolvedValue(rows) };
  result.project.mockReturnValue(result);
  return result;
}
function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  dashboardNotificationsRoutes();
  mocks.dismissed.mockResolvedValue(new Set(["hidden"]));
});

describe("Notification status reads", () => {
  it("keeps historical rows, delivery precedence, latest details, dismissal and ordering", async () => {
    const jobs = cursor([
      { jobId: "recent", actualStart: "2026-10-20", customerEmail: "a@example.test", customerPhone: "123" },
      { jobId: "hidden", actualStart: "2026-10-19" },
      { jobId: "old", actualStart: "2020-01-01", customerName: "Old customer", driverInitials: "MA" }
    ]);
    const activity = cursor([
      { jobId: "recent", action: "CLIENT_REVIEW_EMAIL_SENT", detail: "first", timestamp: "2026-10-20T10:00:00Z" },
      { jobId: "recent", action: "CLIENT_REVIEW_EMAIL_SENT", detail: "latest", timestamp: "2026-10-20T11:00:00Z" },
      { jobId: "recent", action: "CLIENT_REVIEW_EMAIL_FAILED", timestamp: "2026-10-20T12:00:00Z" },
      { jobId: "recent", action: "CLIENT_JOB_STARTED_SMS_SENT", timestamp: "2026-10-20T11:00:00Z" },
      { jobId: "recent", action: "CLIENT_JOB_STARTED_SMS_SKIPPED", detail: "disabled", timestamp: "2026-10-20T12:00:00Z" }
    ]);
    mocks.jobsFind.mockReturnValue(jobs);
    mocks.activityFind.mockReturnValue(activity);
    const res = response();
    await mocks.handlers["/"]({}, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].rows).toEqual([
      { jobId: "old", actualStart: "2020-01-01", customerName: "Old customer", driverInitials: "MA", customerEmail: "", customerPhone: "",
        email: { state: "skipped", detail: "", at: "" }, sms: { state: "skipped", detail: "", at: "" } },
      { jobId: "recent", actualStart: "2026-10-20", customerName: "", driverInitials: "", customerEmail: "a@example.test", customerPhone: "123",
        email: { state: "sent", detail: "latest", at: "2026-10-20T11:00:00Z" },
        sms: { state: "skipped", detail: "disabled", at: "2026-10-20T12:00:00Z" } }
    ]);
    // Guard the cause of the repeated stalls: no full job/activity downloads.
    expect(jobs.project).toHaveBeenCalledWith({ _id: 0, jobId: 1, customerName: 1, customerEmail: 1, customerPhone: 1, driverInitials: 1, actualStart: 1 });
    expect(mocks.activityFind).toHaveBeenCalledWith({ action: { $in: expect.arrayContaining([
      "CLIENT_REVIEW_EMAIL_SENT", "CLIENT_REVIEW_EMAIL_FAILED", "CLIENT_JOB_STARTED_SMS_SENT", "CLIENT_JOB_STARTED_SMS_FAILED", "CLIENT_JOB_STARTED_SMS_SKIPPED"
    ]) } });
    expect(activity.project).toHaveBeenCalledWith({ _id: 0, jobId: 1, action: 1, detail: 1, timestamp: 1 });
  });

  it("preserves pending and failed statuses", async () => {
    mocks.jobsFind.mockReturnValue(cursor([{ jobId: "job", customerEmail: "a@example.test", customerPhone: "123" }]));
    mocks.activityFind.mockReturnValue(cursor([{ jobId: "job", action: "CLIENT_JOB_STARTED_SMS_FAILED", detail: "rejected", timestamp: "2026-10-20" }]));
    const res = response();
    await mocks.handlers["/"]({}, res);
    expect(res.json.mock.calls[0][0].rows[0]).toMatchObject({
      email: { state: "pending", detail: "", at: "" }, sms: { state: "failed", detail: "rejected", at: "2026-10-20" }
    });
  });

  it("reports a database failure instead of silently returning an empty success", async () => {
    const jobs = cursor([]);
    jobs.toArray.mockRejectedValue(new Error("private database detail"));
    mocks.jobsFind.mockReturnValue(jobs);
    mocks.activityFind.mockReturnValue(cursor([]));
    const res = response();
    await mocks.handlers["/"]({}, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "NOTIFICATIONS_FETCH_FAILED", message: "Failed to load notification status." } });
  });
});
