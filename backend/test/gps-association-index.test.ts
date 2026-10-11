import { describe, expect, it } from "vitest";
import { associateGpsEvent, createGpsAssociator } from "../src/gps/gps.association";
import type { Job } from "../src/jobs/job.types";
describe("Indexed GPS ownership", () => {
  it("retains the original ownership, ambiguity, missing-device and historical reassignment decisions", () => {
    const now = "2026-10-10T12:00:00Z";
    const job = (jobId: string, imei: string) => ({ jobId, driverInitials: "MA", gpsliveImei: imei, status: "COMPLETED", actualStart: "2026-10-10T09:00:00Z", actualFinish: "2026-10-10T10:00:00Z" } as Job);
    const jobs = [job("ONE", "A"), job("TWO", "B"), { ...job("THREE", "C"), gpsDeviceHistory: [{ imei: "A", from: "2026-10-10T09:30:00Z", to: null, driverInitials: "AB", source: "profile-snapshot" as const }] }];
    const indexed = createGpsAssociator(jobs, now);
    for (const imei of ["A", "B", "C", "UNKNOWN", null]) for (const occurredAt of ["2026-10-10T09:15:00Z", "2026-10-10T09:45:00Z", null]) {
      const event = { imei, occurredAt, timeSource: "provider-assumed-utc" as const };
      expect(indexed(event)).toEqual(associateGpsEvent(event, jobs, now));
    }
  });
});
