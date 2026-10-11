import { beforeEach, describe, expect, it, vi } from "vitest";
const save = vi.fn(), jobs = vi.fn(), congestion = vi.fn(), tunnel = vi.fn();
const notifications = vi.fn();
vi.mock("../src/integrations/gpslive", () => ({ fetchGpsLiveNotifications: (...args: unknown[]) => notifications(...args) }));
vi.mock("../src/gps/gps.repo", () => ({ saveGpsEvent: (...args: unknown[]) => save(...args) }));
vi.mock("../src/db/jobs.repo", () => ({ listJobs: (...args: unknown[]) => jobs(...args) }));
vi.mock("../src/jobs/congestion-zone.service", () => ({ flagCongestionZoneEntry: (...args: unknown[]) => congestion(...args), flagTunnelZoneEntry: (...args: unknown[]) => tunnel(...args) }));
import { ingestGpsWebhook, clearGpsNotificationCache } from "../src/gps/gps.ingest";
const received = "2026-10-09T10:00:00Z";
const body = { event_id: "id", imei: "123", type: "zone_in", dt_tracker: "2026-10-09T09:59:30Z", event_desc: "Dartford Crossing" };
describe("Persist-first GPS webhook ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks(); save.mockImplementation(async row => row);
    clearGpsNotificationCache(); notifications.mockResolvedValue([]);
    jobs.mockResolvedValue([{ jobId: "JOB", driverInitials: "AB", status: "IN_PROGRESS", gpsliveImei: "123", onMyWayAt: "2026-10-09T09:00:00Z", actualStart: "2026-10-09T09:30:00Z", actualFinish: "" }]);
    congestion.mockResolvedValue(undefined); tunnel.mockResolvedValue(undefined);
  });
  it("stores Dartford events before the legacy notification flag", async () => {
    const result = await ingestGpsWebhook(body, received);
    expect(result).toMatchObject({ preserved: true, association: { jobId: "JOB" } });
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(tunnel.mock.invocationCallOrder[0]);
    expect(tunnel).toHaveBeenCalledWith("JOB", "AB", "123", "2026-10-09T09:59:30.000Z");
  });
  it("retains exits, unknown zones and missing identity without creating notifications", async () => {
    await ingestGpsWebhook({ ...body, type: "zone_out" }, received);
    await ingestGpsWebhook({ ...body, event_desc: "Unknown zone" }, received);
    await ingestGpsWebhook({ ...body, imei: undefined, dt_tracker: undefined }, received);
    expect(save).toHaveBeenCalledTimes(3);
    expect(tunnel).not.toHaveBeenCalled();
  });
  it("keeps a saved raw event recoverable if job matching fails", async () => {
    jobs.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(ingestGpsWebhook(body, received)).rejects.toThrow();
    expect(save).toHaveBeenCalledOnce();
  });
  it("does not send stale/delayed alerts to the currently active job", async () => {
    await ingestGpsWebhook({ ...body, dt_tracker: "2026-10-09T09:15:00Z" }, received);
    expect(save).toHaveBeenCalledOnce();
    expect(tunnel).not.toHaveBeenCalled();
  });
  it("resolves a missing webhook timestamp only through the same provider event ID", async () => {
    notifications.mockResolvedValue([{ ...body, device: { imei: "123", name: "Van" } }]);
    const result = await ingestGpsWebhook({ ...body, dt_tracker: undefined }, received);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ association: { jobId: "JOB" } });
    expect(tunnel).toHaveBeenCalledWith("JOB", "AB", "123", "2026-10-09T09:59:30.000Z");
  });
});
