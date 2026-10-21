import { describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("../src/db/van.repo", () => ({ listVanRecords: async () => data.rows, getVanRecord: vi.fn(), deleteVanRecord: vi.fn() }));
vi.mock("../src/auth/driver-account.service", () => ({ listDriverProfiles: async () => [
  { email: "caio@example.invalid", initials: "KA", fullName: "Caio", vanRegistration: "TEST123" },
  { email: "other@example.invalid", initials: "TI", fullName: "Other Driver", vanRegistration: "OTHER123" }
] }));
vi.mock("../src/db/van-compliance.repo", () => ({ listVanCompliance: async () => [], saveVanCompliance: vi.fn() }));
vi.mock("../src/storage/cloudinary", () => ({ toThumbnailUrl: (url: string) => url, destroyEvidenceImage: vi.fn(), publicIdFromCloudinaryUrl: vi.fn() }));
import { dashboardVanRoutes } from "../src/admin/dashboard/van.routes";

const call = async (query: Record<string, string>, path = "/drivers", status = 200) => {
  const route = dashboardVanRoutes().stack.find(layer => layer.route && (Array.isArray(layer.route.path) ? layer.route.path.includes(path) : layer.route.path === path))!.route!;
  let body: any;
  const response = { status: vi.fn().mockReturnThis(), json: (value: any) => { body = value; } };
  await route.stack[0].handle({ query }, response, vi.fn());
  expect(response.status).toHaveBeenCalledWith(status);
  return body;
};

describe("Van preview history", () => {
  it("keeps history and latest cards inside the selected period, including when an old client sends history=all", async () => {
    const base = { driverEmail: "caio@example.invalid", driverInitials: "KA", driverName: "Caio", vanRegistration: "TEST123", photoUrl: "" };
    data.rows = [
      { ...base, _id: "service", type: "SERVICE", submittedAt: "2026-07-20T09:00:00Z", serviceMileage: 40000 },
      { ...base, _id: "fuel", type: "FUEL", submittedAt: "2026-10-15T09:00:00Z", odometerReading: 47500, fuelCost: 70 },
      { ...base, _id: "mileage", type: "MILEAGE", submittedAt: "2026-10-17T09:00:00Z", mileage: 48000 },
      { ...base, _id: "other", driverEmail: "other@example.invalid", driverInitials: "TI", driverName: "Other Driver", type: "FUEL", submittedAt: "2026-10-17T10:00:00Z" }
    ];
    const original = structuredClone(data.rows);
    const range = { from: "2026-10-17T00:00:00Z", to: "2026-10-17T23:59:59Z" };
    const legacy = (await call(range)).items.find((item: any) => item.driverInitials === "KA");
    expect(legacy.records.map((row: any) => row.id)).toEqual(["mileage"]);
    const full = (await call({ ...range, history: "all" })).items.find((item: any) => item.driverInitials === "KA");
    expect(full.records.map((row: any) => row.id)).toEqual(["mileage"]);
    expect(full.latestFuel).toBeNull(); expect(full.latestService).toBeNull();
    expect(full.latestMileage.id).toBe("mileage");
    const today = (await call({ from: "2026-10-18T00:00:00Z", to: "2026-10-18T23:59:59Z", history: "all" })).items.find((item: any) => item.driverInitials === "KA");
    expect(today.records).toHaveLength(0); expect(today.latestMileage).toBeNull();
    const allDates = (await call({})).items.find((item: any) => item.driverInitials === "KA");
    expect(allDates.records.map((row: any) => row.id)).toEqual(["service", "fuel", "mileage"]);
    expect(data.rows).toEqual(original);
  });

  it("uses inclusive London calendar days and actual instants across differing ISO offsets", async () => {
    const base = { type: "MILEAGE", mileage: 10000, driverEmail: "caio@example.invalid", driverInitials: "KA", driverName: "Caio", vanRegistration: "TEST123", photoUrl: "" };
    data.rows = [
      { ...base, _id: "before", submittedAt: "2026-10-16T22:59:59.999Z" },
      { ...base, _id: "start", submittedAt: "2026-10-16T23:00:00.000Z" },
      { ...base, _id: "offset", submittedAt: "2026-10-17T00:30:00+01:00" },
      { ...base, _id: "end", submittedAt: "2026-10-17T22:59:59.999Z" },
      { ...base, _id: "after", submittedAt: "2026-10-17T23:00:00.000Z" }
    ];
    const query = { from: "2026-10-17", to: "2026-10-17" };
    const driver = (await call(query)).items.find((item: any) => item.driverInitials === "KA");
    expect(driver.records.map((row: any) => row.id)).toEqual(["start", "offset", "end"]);
    expect(driver.latestMileage.id).toBe("end");
    const records = await call(query, "/records");
    expect(records.items.map((row: any) => row.id)).toEqual(["start", "offset", "end"]);
    expect(records.pagination.total).toBe(3);
  });

  it("filters roster rows as well as submissions before pagination when searching", async () => {
    data.rows = [
      { _id: "f", type: "FUEL", driverEmail: "caio@example.invalid", driverInitials: "KA", driverName: "Caio", vanRegistration: "TEST123", fuelCost: 70, submittedAt: "2026-10-17T09:00:00Z", photoUrl: "" },
      { _id: "other", type: "FUEL", driverEmail: "other@example.invalid", driverInitials: "TI", driverName: "Other Driver", vanRegistration: "OTHER123", fuelCost: 90, submittedAt: "2026-10-17T09:00:00Z", photoUrl: "" }
    ];
    for (const q of ["Caio", "test 123", "70"]) {
      const result = await call({ q, pageSize: "1" });
      expect(result.pagination.total).toBe(1);
      expect(result.items[0].driverInitials).toBe("KA");
      expect(result.items[0].records.map((row: any) => row.id)).toEqual(["f"]);
    }
    expect((await call({ q: "not-a-driver" })).pagination.total).toBe(0);
  });

  it("rejects invalid and reversed ranges instead of silently returning misleading records", async () => {
    expect((await call({ from: "bad-date" }, "/drivers", 400)).error.message).toMatch(/Invalid/);
    expect((await call({ from: "2026-10-18", to: "2026-10-17" }, "/drivers", 400)).error.message).toMatch(/end date/);
  });
});
