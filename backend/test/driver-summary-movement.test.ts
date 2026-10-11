import { describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";
import type { GpsDrive } from "../src/gps/gps.types";
import { loadDriverMovement, summarizeDriverMovement } from "../src/admin/dashboard/driver-summary-movement";
const mocks = vi.hoisted(() => ({ read: vi.fn(), context: vi.fn() }));
vi.mock("../src/gps/gps.repo", () => ({ readGpsMovementRange: mocks.read }));
vi.mock("../src/reports/driver-report.repo", () => ({ loadReportContextJobs: mocks.context }));
const job = (id: string, initials = "MA", changes: Partial<Job> = {}) => ({ jobId: id, driverInitials: initials, status: "COMPLETED", gpsliveImei: "DEVICE", actualStart: "2026-10-10T09:00:00Z", actualFinish: "2026-10-10T10:00:00Z", ...changes } as Job);
const drive: GpsDrive = { _id: "D", imei: "DEVICE", start: "2026-10-10T09:00:00Z", end: "2026-10-10T10:00:00Z", movingSeconds: 1800 };
describe("Driver summary moving hours", () => {
  it("uses recorded GPS moving time rather than working duration and excludes unfinished jobs", () => {
    const rows = [job("J"), job("ACTIVE", "AB", { status: "READY" as Job["status"], gpsliveImei: "OTHER" })];
    expect(summarizeDriverMovement(rows, new Map([["J", "MA"], ["ACTIVE", "AB"]]), rows, [], [drive]).get("MA")).toEqual({ movingKnownSeconds: 1800, movingUnknownJobs: 0, movingPartialJobs: 0 });
  });
  it("rejects ambiguous shared devices and keeps missing or manual-finish movement unknown", () => {
    const a = job("J"), b = job("OTHER", "AB");
    expect(summarizeDriverMovement([a], new Map([["J", "MA"]]), [a, b], [], [drive]).get("MA")?.movingUnknownJobs).toBe(1);
    const manual = job("J", "MA", { actualFinishSource: "admin-manual" });
    expect(summarizeDriverMovement([manual], new Map([["J", "MA"]]), [manual], [], [drive]).get("MA")?.movingUnknownJobs).toBe(1);
  });
  it("marks partial and truncated history and preserves observed stationary zero", () => {
    const a = job("J"), ids = new Map([["J", "MA"]]);
    expect(summarizeDriverMovement([a], ids, [a], [], [{ ...drive, end: "2026-10-10T09:30:00Z" }]).get("MA")?.movingPartialJobs).toBe(1);
    expect(summarizeDriverMovement([a], ids, [a], [], [{ ...drive, movingSeconds: 0 }], true).get("MA")).toEqual({ movingKnownSeconds: 0, movingUnknownJobs: 0, movingPartialJobs: 1 });
  });
  it("reads each shared device once and degrades to unavailable on GPS read failure", async () => {
    mocks.context.mockResolvedValue([]); mocks.read.mockResolvedValue({ positions: [], drives: [drive], truncated: false });
    const a = job("J"), b = job("LATER", "AB", { actualStart: "2026-10-10T11:00:00Z", actualFinish: "2026-10-10T12:00:00Z" });
    const identities = new Map([["J", "MA"], ["LATER", "AB"]]);
    const result = await loadDriverMovement([a, b], identities);
    expect(mocks.read).toHaveBeenCalledTimes(1); expect(result.get("MA")?.movingKnownSeconds).toBe(1800);
    expect(result.get("AB")?.movingUnknownJobs).toBe(1);
    mocks.read.mockRejectedValueOnce(new Error("Synthetic read failure"));
    expect((await loadDriverMovement([a], identities)).get("MA")?.movingUnknownJobs).toBe(1);
  });
});
