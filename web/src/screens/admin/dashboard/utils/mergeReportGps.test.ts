import { describe, expect, it } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import { mergeReportGps } from "./mergeReportGps";

const load = () => sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });

describe("independent report GPS enrichment", () => {
  it("merges lightweight road activity without replacing movement or manual data", async () => {
    const core = structuredClone(await load()), activity = structuredClone(await load());
    activity.meta.movementIncluded = false;
    activity.summary.movingKnownSeconds = 0;
    activity.jobs.items[0].movement = undefined;
    activity.jobs.items[0].duration.workingMinutes = 999999;
    const result = mergeReportGps(core, activity);
    expect(result.roadAlerts).toBe(activity.roadAlerts);
    expect(result.roadAlertSummary).toBe(activity.roadAlertSummary);
    expect(result.summary.movingKnownSeconds).toBe(core.summary.movingKnownSeconds);
    expect(result.jobs.items[0].movement).toBe(core.jobs.items[0].movement);
    expect(result.jobs.items[0].duration).toBe(core.jobs.items[0].duration);
    expect(result.summary.paymentCards).toBe(core.summary.paymentCards);
  });
  it("adds tracker fields without replacing the core prices, hours, submissions or job order", async () => {
    const core = structuredClone(await load()), tracker = structuredClone(await load());
    const originalMovement = core.summary.movingKnownSeconds;
    const first = tracker.jobs.items[0];
    tracker.summary.paymentCards!.driverCollectionPence = 999999;
    tracker.summary.workingMinutesKnown = 999999;
    tracker.summary.movingKnownSeconds = 3600;
    first.customer.name = "Changed in a later tracker response";
    first.finance.acceptedPence = 999999;
    first.duration.workingMinutes = 999999;
    first.duration.arrivalDelayMinutes = 25;
    first.manualDetails = null;
    first.movement = { onJob: { coverage: "sampled", movingSeconds: 3600, stationarySeconds: 0, idleSeconds: 0, engineOffSeconds: 0, unknownSeconds: 0 }, approach: null };
    tracker.jobs.items.reverse();
    const result = mergeReportGps(core, tracker);
    expect(result.summary.paymentCards).toBe(core.summary.paymentCards);
    expect(result.summary.workingMinutesKnown).toBe(core.summary.workingMinutesKnown);
    expect(result.summary.movingKnownSeconds).toBe(3600);
    expect(result.jobs.items.map(job => job.jobId)).toEqual(core.jobs.items.map(job => job.jobId));
    expect(result.jobs.items[0].finance).toBe(core.jobs.items[0].finance);
    expect(result.jobs.items[0].customer).toBe(core.jobs.items[0].customer);
    expect(result.jobs.items[0].manualDetails).toBe(core.jobs.items[0].manualDetails);
    expect(result.jobs.items[0].duration.workingMinutes).toBe(core.jobs.items[0].duration.workingMinutes);
    expect(result.jobs.items[0].duration.arrivalDelayMinutes).toBe(25);
    expect(result.jobs.items[0].movement?.onJob.movingSeconds).toBe(3600);
    expect(core.summary.movingKnownSeconds).toBe(originalMovement);
  });

  it("keeps the core report unchanged while GPS is absent or belongs to another scope", async () => {
    const core = await load(), tracker = await load();
    expect(mergeReportGps(core)).toBe(core);
    expect(mergeReportGps(core, { ...tracker, driver: { ...tracker.driver, initials: "OTHER" } })).toBe(core);
    expect(mergeReportGps(core, { ...tracker, range: { ...tracker.range, from: "2026-01-01" } })).toBe(core);
  });
});
