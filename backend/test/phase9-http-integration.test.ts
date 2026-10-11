import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtraChargeType, type Job } from "../src/jobs/job.types";

const state = vi.hoisted(() => ({ jobs: new Map<string, any>(), manuals: new Map<string, any>(), inserts: 0, active: true, tokenVersion: 1, accountFailure: false,
  profile: { initials: "AB", email: "synthetic@example.invalid", fullName: "Synthetic Driver", active: true, role: "Driver", imei: "", chatUserName: "" }, settingReads: vi.fn() }));
vi.mock("../src/config/env", () => ({ env: { nodeEnv: "development", signatureLinkSecret: "synthetic-test-key-not-for-release", adminPassword: "synthetic-admin-password", timezone: "Europe/London",
  maxImageBytes: 1048576, calendarSyncTtlMs: 120000, congestionCharge: 18, tunnelCharge: 13.6, crewRate1Man: 55, crewRate2Man: 55, crewRate3Man: 65, packingRate: 95, crewBillingUnit: "Per 30 minutes" } }));
vi.mock("../src/db/mongo", () => ({ getDb: () => { throw new Error("Live DB access prohibited in Phase 9 tests."); } }));
vi.mock("../src/db/jobs.repo", () => ({ getJob: async (id: string) => structuredClone(state.jobs.get(id) ?? null), upsertJob: async (job: any) => { state.jobs.set(job.jobId, structuredClone(job)); invalidateReportReads(); },
  listJobs: async (filter: any = {}) => [...state.jobs.values()].filter(job => !filter.driverInitials || job.driverInitials === filter.driverInitials).map(job => structuredClone(job)) }));
vi.mock("../src/auth/driver-account.service", () => ({ getDriverProfile: async (email: string) => email === state.profile.email ? state.profile : null,
  getDriverProfileByInitials: async (initials: string) => initials === "AB" ? state.profile : null,
  getDriverAccount: async (email: string) => { if (state.accountFailure) throw new Error("Private database failure"); return email === state.profile.email ? { ...state.profile, active: state.active, tokenVersion: state.tokenVersion } : null; } }));
vi.mock("../src/db/driver-job-summary.repo", () => ({ getDriverJobSummary: async (id: string) => structuredClone(state.manuals.get(id) ?? null),
  listDriverJobSummariesForJobs: async (ids: string[]) => ids.flatMap(id => state.manuals.has(id) ? [structuredClone(state.manuals.get(id))] : []),
  insertDriverJobSummary: async (summary: any) => { if (state.manuals.has(summary.jobId)) throw { code: 11000 }; const saved = { ...summary, createdAt: new Date() }; state.manuals.set(summary.jobId, structuredClone(saved)); state.inserts++; return saved; } }));
vi.mock("../src/db/activity.repo", () => ({ appendActivity: async () => {}, listActivityForJob: async () => [] }));
vi.mock("../src/db/evidence.repo", () => ({ readEvidenceSummary: async () => ({}), listEvidenceForJob: async () => [], listEvidenceForJobs: async () => [], getEvidence: async () => null, deleteEvidence: async () => {} }));
vi.mock("../src/db/scenario.repo", () => ({ listScenarioSubmissionsForJob: async () => [] }));
vi.mock("../src/db/settings.repo", () => ({ getSetting: async (key: string, fallback: string) => { state.settingReads(key); return key === "OVERTIME_RATE_PER_30" ? "55" : fallback; } }));
vi.mock("../src/admin/dashboard/dataset-cache", () => ({ invalidateDashboardDataset: () => invalidateReportReads() }));
vi.mock("../src/jobs/booking.service", () => ({ syncTodayBookings: async () => [] }));
vi.mock("../src/jobs/congestion-zone.service", () => ({ checkCongestionZoneAtJobStart: async () => {} }));
vi.mock("../src/notifications/message-catalog", () => ({ isMessageEnabled: async () => false }));
vi.mock("../src/google/gmail", () => ({ sendOpsJobCompletionEmail: async () => {}, sendJobStartedEmail: async () => {}, sendOpsCustomerSignedEmail: async () => {}, sendOpsVanLoadedEmail: async () => {}, sendOpsVanUnloadedEmail: async () => {}, sendReviewRequestEmail: async () => {} }));
vi.mock("../src/integrations/firetext", () => ({ sendJobStartedSms: async () => {} }));
vi.mock("../src/push/push.service", () => ({ sendPushToAdmins: async () => {} }));
vi.mock("../src/jobs/evidence.service", () => ({ uploadEvidence: async () => { throw new Error("No real uploads in this integration test."); }, looksLikeImage: () => false }));
vi.mock("../src/storage/cloudinary", () => ({ uploadEvidenceImage: async () => { throw new Error("No real uploads in this integration test."); }, destroyEvidenceImage: async () => {} }));
vi.mock("../src/gps/gps.repo", () => ({ readGpsRange: async () => ({ events: [], positions: [], drives: [], runs: [], truncated: false }) }));
vi.mock("../src/reports/report-road-allocations", () => ({ reportRoadAllocations: async () => [] }));
vi.mock("../src/gps/road-charge.repo", () => ({ reserveRoadObligation: async () => null, roadAllocationConflict: async () => null, saveAuthorityReferences: async () => {} }));
vi.mock("../src/reports/driver-report.repo", () => ({ ReportCapacityError: class extends Error {},
  loadDriverReportJobs: async (initials: string, from: string, to: string) => [...state.jobs.values()].filter(job => (job.reportIdentity?.initials || job.driverInitials) === initials && Date.parse(job.actualStart || job.bookedStart) >= Date.parse(from) && Date.parse(job.actualStart || job.bookedStart) < Date.parse(to))
    .map(job => ({ job: structuredClone(job), manual: structuredClone(state.manuals.get(job.jobId) ?? null) })),
  loadReportContextJobs: async () => [], loadReportLiabilitySources: async () => ({ sources: [], jobs: [], audits: [] }), reportPrepaymentConflicts: async () => [] }));

import { setAdminSessionCookie } from "../src/auth/admin-session";
import { issueSessionToken } from "../src/auth/session";
import { prepareJobTimeBilling, freezeJobCharges, calculateJobTotal } from "../src/jobs/job-billing.service";
import { invalidateReportReads } from "../src/reports/report-read-cache";

let server: Server, base: string;
function driverCookie() { return `tmv_driver_session=${issueSessionToken(state.profile.email, 1)}`; }
function adminCookie(exp?: number) {
  if (exp !== undefined) {
    const payload = Buffer.from(JSON.stringify({ purpose: "admin_session", exp })).toString("base64url");
    const key = createHmac("sha256", "synthetic-test-key-not-for-release").update("synthetic-admin-password").digest("hex");
    return `tmv_admin_session=${payload}.${createHmac("sha256", key).update(payload).digest("hex")}`;
  }
  let cookie = ""; setAdminSessionCookie({ cookie: (name: string, value: string) => { cookie = `${name}=${value}`; } } as any); return cookie;
}
async function startServer() {
  const { jobsRoutes } = await import("../src/jobs/jobs.routes");
  const { dashboardDriverReportsRoutes } = await import("../src/admin/dashboard/driver-reports.routes");
  const { requireAdminAuth } = await import("../src/auth/require-admin-auth");
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use("/api/jobs", jobsRoutes()); app.use("/api/admin/driver-reports", requireAdminAuth, dashboardDriverReportsRoutes());
  server = await new Promise<Server>(resolve => { const live = app.listen(0, "127.0.0.1", () => resolve(live)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function stopServer() { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); }
async function request(path: string, cookie = "", body?: unknown) { return fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const range = "from=2026-10-09&to=2026-10-09";
const manualBody = () => ({ schemaVersion: 2, startTime: "2026-10-09T08:00:00Z", endTime: "2026-10-09T10:30:00Z", helperName: "", helperHours: "", paymentMethods: ["Cash", "Card", "Invoice"], paymentAmounts: { Cash: "100", Card: "150", Invoice: "23" }, chargeItems: [{ type: "congestion", amount: "18" }] });
beforeAll(startServer);
afterAll(stopServer);
beforeEach(async () => {
  invalidateReportReads();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-10T08:00:00Z")); vi.unstubAllEnvs();
  state.jobs.clear(); state.manuals.clear(); state.inserts = 0; state.active = true; state.tokenVersion = 1; state.accountFailure = false; state.settingReads.mockClear();
  const job = { jobId: "INTEGRATION", driverInitials: "AB", status: "IN_PROGRESS", currentState: "WAITING_OVERTIME", crewSize: 1, extraCharges: [ExtraChargeType.CONGESTION], extraChargeText: "55 per 30 minutes",
    bookedStart: "2026-10-09T08:00:00Z", bookedFinish: "2026-10-09T09:30:00Z", bookedMinutes: 90, actualStart: "2026-10-09T08:00:00Z", actualFinish: "2026-10-09T10:30:00Z",
    actualStartSource: "arrival-photo", actualFinishSource: "empty-van-photo", basePrice: 200, overtimeCharge: 0, totalCharges: 200, customerName: "Synthetic Customer", customerEmail: "", customerPhone: "", pickup: "A", dropoff: "B", rawTitle: "", rawDescription: "",
    roadTariffSnapshot: { version: "tmv-customer-road-v1", effectiveFrom: "2026-10-09T07:00:00Z", capturedAt: "2026-10-09T07:00:00Z", congestionPence: 1800, tunnelPence: 1360, source: "pricing-settings" },
    paymentMethod: "Cash, Card", paymentStatus: "Paid", paymentBreakdown: [{ method: "Cash", amount: 100 }, { method: "Card", amount: 173 }] } as Job;
  await prepareJobTimeBilling(job, true); await freezeJobCharges(job); job.totalCharges = job.calculatedTotalCharges = job.amountCharged = await calculateJobTotal(job);
  job.currentState = "WAITING_REVIEW_CHECK"; state.jobs.set(job.jobId, structuredClone(job));
  state.jobs.set("NEXT", { ...structuredClone(job), jobId: "NEXT", status: "READY", currentState: "READY", actualStart: "", actualFinish: "", onMyWayAt: "2026-10-09T07:00:00Z" });
  delete state.jobs.get("NEXT").timeBilling; delete state.jobs.get("NEXT").chargeSnapshot; delete state.jobs.get("NEXT").roadTariffSnapshot;
  Object.assign(state.jobs.get("NEXT"), { paymentBreakdown: [], paymentMethod: "", paymentStatus: "", amountCharged: 0, totalCharges: 200, overtimeCharge: 0, overtimeMinutes: 0 });
  delete state.jobs.get("NEXT").calculatedTotalCharges;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Real HTTP job/manual/report/export integration with synthetic persistence", () => {
  it("completes, defers missing manual details without blocking starts, locks/retries, survives restart and exports matching totals", async () => {
    const driver = driverCookie(), admin = adminCookie();
    expect((await request("/api/jobs/INTEGRATION/actions", driver, { action: "REVIEW_NONE" })).status).toBe(200);
    expect(state.jobs.get("INTEGRATION")).toMatchObject({ status: "COMPLETED", timeBilling: { scheduledMinutes: 90, allocatedMinutes: 120, actualMinutes: 150, extraChargePence: 5500 }, totalCharges: 273 });
    const pending = await request("/api/jobs/pending-submissions", driver); expect(pending.status).toBe(200);
    expect((await pending.json()).jobs.map((job: { jobId: string }) => job.jobId)).toEqual(["INTEGRATION"]);
    expect((await (await request("/api/jobs/list", driver)).json()).pendingManualDetails).toBeNull();
    expect((await request("/api/jobs/NEXT/start", driver, {})).status).toBe(200);
    const submissions = await Promise.all([request("/api/jobs/INTEGRATION/driver-summary", driver, manualBody()), request("/api/jobs/INTEGRATION/driver-summary", driver, manualBody())]);
    expect(submissions.map(row => row.status)).toEqual([200, 200]); expect(state.inserts).toBe(1);
    expect((await (await request("/api/jobs/pending-submissions", driver)).json()).jobs).toEqual([]);
    await stopServer(); vi.resetModules(); await startServer();
    expect((await request("/api/jobs/INTEGRATION/driver-summary", driver, manualBody())).status).toBe(200); expect(state.inserts).toBe(1);
    const changed = await request("/api/jobs/INTEGRATION/driver-summary", driver, { ...manualBody(), helperName: "Changed" }); expect(changed.status).toBe(409);
    const report = await (await request(`/api/admin/driver-reports/AB?${range}&pageSize=1`, admin)).json();
    expect(report.summary).toMatchObject({ completedJobs: 1, expectedKnownPence: 27300, recognizedKnownCollectionsPence: 25000, outstandingKnownPence: 2300, pendingManualJobs: 0 });
    const excel = await request(`/api/admin/driver-reports/AB/export.xlsx?${range}&pageSize=1`, admin); expect(excel.status).toBe(200); expect(excel.headers.get("cache-control")).toContain("no-store");
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await excel.arrayBuffer()) as any);
    const summary = book.getWorksheet("Summary")!; const metrics = new Map<string, unknown>(); summary.eachRow(row => metrics.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(metrics.get("Expected Known GBP")).toBe(273); expect(metrics.get("Outstanding Known GBP")).toBe(23); expect(book.worksheets).toHaveLength(8);
    const pdf = await request(`/api/admin/driver-reports/AB/export.pdf?${range}`, admin); expect(pdf.status).toBe(200); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await request("/api/jobs/NEXT/start", driver, {})).status).toBe(200);
  }, 30000);
  it("requires a driver session for pending submissions", async () => {
    expect((await request("/api/jobs/pending-submissions", "")).status).toBe(401);
  });
  it("denies missing, forged, expired, driver and JSON-object cookies at the admin boundary", async () => {
    for (const cookie of ["", "tmv_admin_session=forged", adminCookie(Date.now()), driverCookie(), `tmv_admin_session=${encodeURIComponent('j:{"purpose":"admin_session"}')}`]) {
      expect((await request(`/api/admin/driver-reports/AB/export.xlsx?${range}`, cookie)).status).toBe(401);
    }
  });
  it("renews a near-expiry real admin cookie without losing private download headers", async () => {
    const res = await request(`/api/admin/driver-reports/AB?${range}`, adminCookie(Date.now() + 3600000)); expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("tmv_admin_session="); expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("renews an active driver session and rejects the old token at its exact expiry", async () => {
    const start = Date.now(), cookie = driverCookie(); vi.setSystemTime(start + 100 * 86400000);
    const renewed = await request("/api/jobs/INTEGRATION", cookie); expect(renewed.status).toBe(200); expect(renewed.headers.get("set-cookie")).toContain("tmv_driver_session=");
    vi.setSystemTime(start + 180 * 86400000); expect((await request("/api/jobs/INTEGRATION", cookie)).status).toBe(401);
  });
  it("denies deactivated/revoked drivers and fails closed on session repository outages", async () => {
    const cookie = driverCookie(); state.active = false; expect((await request("/api/jobs/INTEGRATION", cookie)).status).toBe(401);
    state.active = true; state.tokenVersion = 2; expect((await request("/api/jobs/INTEGRATION", cookie)).status).toBe(401);
    state.tokenVersion = 1; state.accountFailure = true; const res = await request("/api/jobs/INTEGRATION", cookie); expect(res.status).toBe(503); expect(JSON.stringify(await res.json())).not.toContain("Private database");
    expect((await request("/api/jobs/INTEGRATION", `tmv_driver_session=${encodeURIComponent('j:{"email":"synthetic@example.invalid"}')}`)).status).toBe(401);
  });
  it("prevents cross-driver access/submission and keeps disabled exports from reading private report data", async () => {
    state.jobs.get("INTEGRATION").driverInitials = "OTHER";
    expect((await request("/api/jobs/INTEGRATION/driver-summary", driverCookie(), manualBody())).status).toBe(400); expect(state.inserts).toBe(0);
    vi.stubEnv("TMV_DRIVER_REPORT_EXPORTS_ENABLED", "false"); const res = await request(`/api/admin/driver-reports/AB/export.xlsx?${range}`, adminCookie()); expect(res.status).toBe(503);
    vi.stubEnv("TMV_DRIVER_REPORTS_ENABLED", "false"); expect((await request(`/api/admin/driver-reports/AB?${range}`, adminCookie())).status).toBe(503);
  });
  it("preserves an old completed zero-price job without a new manual gate or retrospective billing", async () => {
    const old = state.jobs.get("INTEGRATION"); old.status = "COMPLETED"; old.currentState = "COMPLETED"; old.totalCharges = old.amountCharged = old.calculatedTotalCharges = 0;
    delete old.timeBilling; delete old.chargeSnapshot; delete old.roadTariffSnapshot;
    const before = structuredClone(old); await prepareJobTimeBilling(old); expect(await calculateJobTotal(old)).toBe(0);
    expect(old).toMatchObject({ ...before, timeBillingStatus: "legacy" }); expect(old).not.toHaveProperty("manualDetailsRequiredAt");
    expect((await request("/api/jobs/NEXT/start", driverCookie(), {})).status).toBe(200);
  });
});
