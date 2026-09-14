import { describe, it, expect } from "vitest";
import { computeVanMileageStatus, toVanComplianceItem } from "../src/jobs/van-mileage.service";
import { VanRecordDoc } from "../src/db/van.repo";

function record(partial: Partial<VanRecordDoc>): VanRecordDoc {
  return {
    driverEmail: "driver@example.com",
    driverName: "Driver",
    driverInitials: "DR",
    vanRegistration: "AB12 CDE",
    photoUrl: "https://example.com/x.jpg",
    submittedAt: "2026-01-01T00:00:00.000Z",
    ...partial
  };
}

describe("computeVanMileageStatus", () => {
  it("finds the last service mileage from the most recent SERVICE record", () => {
    const records = [
      record({ type: "SERVICE", serviceMileage: 4000, submittedAt: "2026-01-01T00:00:00.000Z" }),
      record({ type: "SERVICE", serviceMileage: 12000, submittedAt: "2026-06-01T00:00:00.000Z" })
    ];
    expect(computeVanMileageStatus(records, "AB12 CDE").lastServiceMileage).toBe(12000);
  });

  it("reconciles current mileage across Mileage, Fuel and Service records by recency", () => {
    const records = [
      record({ type: "SERVICE", serviceMileage: 4000, submittedAt: "2026-01-01T00:00:00.000Z" }),
      record({ type: "FUEL", odometerReading: 7000, submittedAt: "2026-02-01T00:00:00.000Z" }),
      record({ type: "MILEAGE", mileage: 10000, submittedAt: "2026-03-01T00:00:00.000Z" })
    ];
    expect(computeVanMileageStatus(records, "AB12 CDE").currentMileage).toBe(10000);
  });

  it("scopes by vanRegistration, ignoring other vans' records", () => {
    const records = [
      record({ type: "SERVICE", serviceMileage: 4000, vanRegistration: "AB12 CDE" }),
      record({ type: "SERVICE", serviceMileage: 99000, vanRegistration: "XY99 ZZZ" })
    ];
    expect(computeVanMileageStatus(records, "AB12 CDE").lastServiceMileage).toBe(4000);
  });

  it("matches vanRegistration case- and whitespace-insensitively", () => {
    const records = [record({ type: "SERVICE", serviceMileage: 4000, vanRegistration: " ab12 cde " })];
    expect(computeVanMileageStatus(records, "AB12 CDE").lastServiceMileage).toBe(4000);
  });

  it("returns nulls when the van has no records at all", () => {
    const status = computeVanMileageStatus([], "AB12 CDE");
    expect(status.currentMileage).toBeNull();
    expect(status.lastServiceMileage).toBeNull();
  });
});

describe("toVanComplianceItem", () => {
  const records = [
    record({ type: "SERVICE", serviceMileage: 4000, submittedAt: "2026-01-01T00:00:00.000Z" }),
    record({ type: "MILEAGE", mileage: 10000, submittedAt: "2026-03-01T00:00:00.000Z" })
  ];

  it("computes lastServiceMileage from the Service log when no admin override is set", () => {
    const item = toVanComplianceItem("AB12 CDE", { vanRegistration: "AB12 CDE", serviceIntervalMiles: 8000, updatedAt: "" }, records);
    expect(item.lastServiceMileage).toBe(4000);
    expect(item.currentMileage).toBe(10000);
    expect(item.serviceIntervalMiles).toBe(8000);
  });

  it("prefers the admin's lastServiceMileageOverride over the computed baseline", () => {
    const item = toVanComplianceItem(
      "AB12 CDE",
      { vanRegistration: "AB12 CDE", serviceIntervalMiles: 8000, lastServiceMileageOverride: 9000, updatedAt: "" },
      records
    );
    expect(item.lastServiceMileage).toBe(9000);
  });

  it("returns nulls for interval/baseline when there is no compliance doc yet", () => {
    const item = toVanComplianceItem("AB12 CDE", null, records);
    expect(item.serviceIntervalMiles).toBeNull();
    expect(item.lastServiceMileageOverride).toBeNull();
    expect(item.lastServiceMileage).toBe(4000);
  });
});
