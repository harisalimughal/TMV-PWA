import { describe, expect, it, vi, beforeEach } from "vitest";

const getJob = vi.fn();
const listJobs = vi.fn().mockResolvedValue([]);
const upsertJob = vi.fn().mockResolvedValue(undefined);
const sendPushToDriver = vi.fn().mockResolvedValue(undefined);
const getSetting = vi.fn().mockImplementation((_key: string, fallback: string) => Promise.resolve(fallback));

vi.mock("../src/config/env", () => ({
  env: { timezone: "Europe/London" }
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: (...args: any[]) => upsertJob(...args)
}));
vi.mock("../src/push/push.service", () => ({
  sendPushToDriver: (...args: any[]) => sendPushToDriver(...args)
}));
// isMessageEnabled/getMessageTitle/getMessageBody (notifications/message-catalog.ts)
// resolve their settings through here -- defaulting every key to its own fallback
// (both push messages default enabled) keeps this test about the flagging/dedup logic,
// not the Messaging tab's own on/off state.
vi.mock("../src/db/settings.repo", () => ({
  getSetting: (...args: any[]) => getSetting(...args)
}));

import { flagCongestionZoneEntry, flagTunnelZoneEntry } from "../src/jobs/congestion-zone.service";

function job(overrides: Partial<any> = {}) {
  return { jobId: "TMV-A", driverInitials: "AB", gpsliveImei: "IMEI-1", ...overrides };
}

beforeEach(() => {
  getJob.mockReset();
  listJobs.mockReset().mockResolvedValue([]);
  upsertJob.mockReset().mockResolvedValue(undefined);
  sendPushToDriver.mockReset().mockResolvedValue(undefined);
  getSetting.mockReset().mockImplementation((_key: string, fallback: string) => Promise.resolve(fallback));
});

describe("flagCongestionZoneEntry", () => {
  it("flags the job when nothing else has claimed today's charge for this van", async () => {
    getJob.mockResolvedValue(job());
    listJobs.mockResolvedValue([]); // no other jobs on this imei

    await flagCongestionZoneEntry("TMV-A", "AB", "IMEI-1");

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0].congestionZoneEnteredAt).toBeTruthy();
    expect(sendPushToDriver).toHaveBeenCalledTimes(1);
  });

  it("does NOT flag when another job for the same van already flagged the congestion zone today", async () => {
    getJob.mockResolvedValue(job({ jobId: "TMV-B" }));
    listJobs.mockResolvedValue([
      job({ jobId: "TMV-A", congestionZoneEnteredAt: new Date().toISOString() })
    ]);

    await flagCongestionZoneEntry("TMV-B", "AB", "IMEI-1");

    expect(upsertJob).not.toHaveBeenCalled();
    expect(sendPushToDriver).not.toHaveBeenCalled();
  });

  it("still flags when the other job's entry was on a previous day", async () => {
    getJob.mockResolvedValue(job({ jobId: "TMV-B" }));
    listJobs.mockResolvedValue([
      job({ jobId: "TMV-A", congestionZoneEnteredAt: "2020-01-01T09:00:00.000Z" })
    ]);

    await flagCongestionZoneEntry("TMV-B", "AB", "IMEI-1");

    expect(upsertJob).toHaveBeenCalledTimes(1);
  });

  it("is idempotent -- does nothing if this job's own flag is already set", async () => {
    getJob.mockResolvedValue(job({ congestionZoneEnteredAt: new Date().toISOString() }));

    await flagCongestionZoneEntry("TMV-A", "AB", "IMEI-1");

    expect(upsertJob).not.toHaveBeenCalled();
    expect(listJobs).not.toHaveBeenCalled();
  });

  it("skips the cross-job dedup check entirely when no imei is known (best-effort)", async () => {
    getJob.mockResolvedValue(job());

    await flagCongestionZoneEntry("TMV-A", "AB", "");

    expect(listJobs).not.toHaveBeenCalled();
    expect(upsertJob).toHaveBeenCalledTimes(1);
  });

  it("scopes the dedup lookup to this van's own imei, not the whole fleet", async () => {
    getJob.mockResolvedValue(job({ jobId: "TMV-B" }));
    listJobs.mockResolvedValue([]);

    await flagCongestionZoneEntry("TMV-B", "AB", "IMEI-1");

    // The actual van-vs-van scoping happens in the Mongo query itself (see
    // db/jobs.repo.ts's listJobs filter) -- this just confirms the service asks for
    // that filter rather than pulling every job and filtering in JS.
    expect(listJobs).toHaveBeenCalledWith({ gpsliveImei: "IMEI-1" });
  });

  it("does not push when DRIVER_CONGESTION_ZONE_PUSH is disabled, but still flags the job", async () => {
    getJob.mockResolvedValue(job());
    listJobs.mockResolvedValue([]);
    getSetting.mockImplementation((key: string, fallback: string) =>
      Promise.resolve(key === "MSG_ENABLED_DRIVER_CONGESTION_ZONE_PUSH" ? "false" : fallback)
    );

    await flagCongestionZoneEntry("TMV-A", "AB", "IMEI-1");

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(sendPushToDriver).not.toHaveBeenCalled();
  });
});

describe("flagTunnelZoneEntry", () => {
  it("dedupes independently of the congestion zone field", async () => {
    getJob.mockResolvedValue(job({ jobId: "TMV-B" }));
    // Another job flagged CONGESTION today, but never the tunnel zone -- tunnel
    // should still be free to flag.
    listJobs.mockResolvedValue([
      job({ jobId: "TMV-A", congestionZoneEnteredAt: new Date().toISOString() })
    ]);

    await flagTunnelZoneEntry("TMV-B", "AB", "IMEI-1");

    expect(upsertJob).toHaveBeenCalledTimes(1);
    expect(upsertJob.mock.calls[0][0].tunnelZoneEnteredAt).toBeTruthy();
  });
});
