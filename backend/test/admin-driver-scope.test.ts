import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminDriverScope, driverVisible, maExcluded, withDriverScope } from "../src/admin/driver-scope";
import { createReportReadCache } from "../src/reports/report-read-cache";

const aggregate = vi.hoisted(() => vi.fn());
vi.mock("../src/db/mongo", () => ({ jobsCollection: async () => ({ aggregate }) }));
vi.mock("../src/auth/driver-account.service", () => ({ listDriverProfiles: async () => [] }));
vi.mock("../src/db/settings.repo", () => ({ getSetting: async (_key: string, fallback: string) => fallback }));
import { listJobsPage, listJobsInRange } from "../src/db/jobs.repo";
import { normalizeMongoDataset } from "../src/admin/dashboard/normalize";
import { summarizeDrivers } from "../src/admin/dashboard/drivers-summary.routes";

beforeEach(() => { aggregate.mockReset().mockImplementation(() => ({ toArray: async () => [] })); });
describe("admin MA read scope", () => {
  it("is opt-in per request and does not change background/default reads", () => {
    expect(maExcluded()).toBe(false);
    withDriverScope(true, () => { expect(driverVisible(" ma ")).toBe(false); expect(driverVisible("MAA")).toBe(true); expect(driverVisible("MK")).toBe(true); });
    expect(driverVisible("MA")).toBe(true);
  });
  it("honours both read headers and navigation-export query parameters, leaving writes alone", () => {
    for (const [method, query, header, expected] of [["GET", {}, "false", true], ["GET", { includeMA: "0" }, undefined, true], ["GET", { includeMA: "1" }, "false", false], ["POST", { includeMA: "0" }, "false", false]] as const) {
      const next = vi.fn(() => expect(maExcluded()).toBe(expected));
      adminDriverScope({ method, query, path: "/jobs", get: () => header } as any, {} as any, next);
      expect(next).toHaveBeenCalledOnce();
    }
  });
  it("blocks the excluded driver's direct report and file exports", () => {
    const json = vi.fn(), res = { status: vi.fn(() => ({ json })) }, next = vi.fn();
    adminDriverScope({ method: "GET", query: { includeMA: "0" }, path: "/driver-reports/ma/export.pdf", get: () => undefined } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(404); expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "DRIVER_EXCLUDED" }) }));
    expect(next).not.toHaveBeenCalled();
  });
  it("keeps concurrent async reads and cached totals in separate scopes", async () => {
    const cache = createReportReadCache<number>();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const excluded = withDriverScope(true, () => cache.get("total", async () => { await wait; expect(maExcluded()).toBe(true); return 100; }));
    const included = withDriverScope(false, () => cache.get("total", async () => { expect(maExcluded()).toBe(false); return 89900295860; }));
    expect(await included).toBe(89900295860); release(); expect(await excluded).toBe(100);
    expect(await withDriverScope(true, () => cache.get("total", async () => 999))).toBe(100);
    expect(await withDriverScope(false, () => cache.get("total", async () => 999))).toBe(89900295860);
  });
  it("excludes MA before both pagination and total count using the captured display identity", async () => {
    await withDriverScope(true, () => listJobsPage({ page: 1, pageSize: 25 }));
    for (const [pipeline] of aggregate.mock.calls) {
      const match = pipeline.findIndex((stage: any) => stage.$match?.__displayDriverInitials?.$ne === "MA");
      expect(match).toBeGreaterThan(0);
      const end = pipeline.findIndex((stage: any) => stage.$count || stage.$skip !== undefined);
      expect(match).toBeLessThan(end);
      const identity = JSON.stringify(pipeline[1]);
      expect(identity.indexOf("$reportIdentity.initials")).toBeLessThan(identity.indexOf("$driverInitials"));
      expect(identity).toContain("$__driverSummary.driverInitials");
    }
  });
  it("scopes range reads used by summaries and CSV exports without changing the original date semantics", async () => {
    await withDriverScope(true, () => listJobsInRange("2026-10-01", "2026-10-31"));
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toContainEqual({ $match: { __displayDriverInitials: { $ne: "MA" } } });
    expect(pipeline.some((stage: any) => stage.$addFields?.__effectiveStart)).toBe(true);
  });
  it("removes MA's anomalous amount from every normalized analytics consumer, preserving stored records", async () => {
    const base = { status: "COMPLETED", bookedStart: "2026-10-13T09:00:00Z", bookedFinish: "2026-10-13T11:00:00Z", extraCharges: [], basePrice: 180 };
    const dataset = { jobs: [{ ...base, jobId: "MA-job", driverInitials: "MA", amountCharged: 898988888 }, { ...base, jobId: "real-job", driverInitials: "TI", amountCharged: 211.60 },
      { ...base, jobId: "reassigned", driverInitials: "MA", reportIdentity: { initials: "TI" }, amountCharged: 100 }], evidence: [], scenarioSubmissions: [], activity: [], exceptions: [], fetchedAt: "2026-10-18T00:00:00Z", durationMs: 0 } as any;
    const before = structuredClone(dataset);
    const without = await withDriverScope(true, () => normalizeMongoDataset(dataset));
    const all = await withDriverScope(false, () => normalizeMongoDataset(dataset));
    expect(without.map(j => j.jobId)).toEqual(["real-job", "reassigned"]);
    expect(without.reduce((sum, j) => sum + j.amountCharged, 0)).toBe(31160);
    expect(all).toHaveLength(3); expect(dataset).toEqual(before);
    expect(withDriverScope(true, () => summarizeDrivers([{ initials: "MA", fullName: "MAN VAN" }, { initials: "TI", fullName: "Tiago" }] as any, all)).some(d => d.initials === "MA")).toBe(false);
  });
});
