import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { complianceCountdown, complianceSummary, dateStatus, serviceGauge, serviceStatus, vehicleAttention } from "./vehicleStatus";

const today = DateTime.fromISO("2026-10-13", { zone: "Europe/London" });

describe("vehicle date states", () => {
  it("marks a passed renewal date as Overdue instead of 'Recorded' (audit p.18)", () => {
    expect(dateStatus("2026-10-10", today)).toMatchObject({ state: "overdue", label: "Overdue", detail: "3 days ago" });
  });
  it("uses the existing 30-day window for Due soon", () => {
    expect(dateStatus("2026-11-12", today).state).toBe("due-soon");
    expect(dateStatus("2026-11-13", today).state).toBe("current");
    expect(dateStatus("2026-10-13", today).label).toBe("Due today");
  });
  it("reports a missing date as missing, not as compliant", () => {
    expect(dateStatus(undefined, today)).toMatchObject({ state: "missing", label: "Date missing", tone: "neutral" });
  });
});

describe("service status", () => {
  it("uses mileage since the last service against the interval", () => {
    expect(serviceStatus({ vanRegistration: "X", serviceIntervalMiles: 8000, lastServiceMileage: 10000, currentMileage: 17600 })).toMatchObject({ state: "due-soon", milesRemaining: 400 });
    expect(serviceStatus({ vanRegistration: "X", serviceIntervalMiles: 8000, lastServiceMileage: 10000, currentMileage: 18100 })).toMatchObject({ state: "overdue", milesRemaining: -100 });
    expect(serviceStatus({ vanRegistration: "X", serviceIntervalMiles: null, lastServiceMileage: 10000 })).toMatchObject({ state: "missing", label: "Interval not set" });
  });
  it("lists due, overdue and missing MOT/tax dates as needing attention, most urgent first", () => {
    const items = vehicleAttention({ vanRegistration: "X", motExpiryDate: "2020-01-01", roadTaxRenewalDate: "2099-01-01" });
    expect(items.map(item => item.label)).toEqual(["MOT"]);
    const missing = vehicleAttention({ vanRegistration: "Y", roadTaxRenewalDate: "2020-01-01" });
    expect(missing.map(item => `${item.label} ${item.status.label.toLowerCase()}`)).toEqual(["Tax overdue", "MOT date missing"]);
  });
});

describe("Van preview countdown and gauge (live Van page rules)", () => {
  const today = DateTime.fromISO("2026-10-15", { zone: "Europe/London" });
  it("shows a full ring and Status: OK more than 30 days out", () => {
    expect(complianceCountdown("2027-02-01", today)).toMatchObject({ days: 109, tone: "ok", ringPercent: 100, center: "109 days", status: "Status: OK" });
  });
  it("fills the ring inside the 30-day window", () => {
    expect(complianceCountdown("2026-10-27", today)).toMatchObject({ days: 12, tone: "warning", ringPercent: 60, center: "12 days", status: "Alert: Due in 12 days" });
    expect(complianceCountdown("2026-10-15", today)).toMatchObject({ days: 0, center: "Today", status: "Due today" });
    expect(complianceCountdown("2026-11-14", today).ringPercent).toBe(8);
  });
  it("reports expiry and missing dates without implying compliance", () => {
    expect(complianceCountdown("2026-10-11", today)).toMatchObject({ tone: "danger", ringPercent: 100, center: "Expired", status: "Expired 4 days ago" });
    expect(complianceCountdown(undefined, today)).toMatchObject({ days: null, tone: "empty", ringPercent: 0, status: "Add date" });
  });
  it("gauges miles to the next service", () => {
    expect(serviceGauge({ vanRegistration: "X", serviceIntervalMiles: 8000, lastServiceMileage: 40000, currentMileage: 44000 }))
      .toMatchObject({ tone: "ok", ringPercent: 50, top: "Next service at 48,000 mi", center: "4,000 mi", status: "Remaining miles: 4,000" });
    expect(serviceGauge({ vanRegistration: "X", serviceIntervalMiles: 8000, lastServiceMileage: 40000, currentMileage: 48120 }))
      .toMatchObject({ tone: "danger", center: "120 mi over", status: "Overdue by 120 mi" });
    expect(serviceGauge({ vanRegistration: "X", serviceIntervalMiles: null })).toMatchObject({ tone: "empty", top: "Not recorded", status: "Interval not set" });
    expect(serviceGauge({ vanRegistration: "X", serviceIntervalMiles: 8000, lastServiceMileage: null })).toMatchObject({ status: "No service logged yet" });
  });
});

describe("complianceSummary", () => {
  const today = DateTime.fromISO("2026-10-16", { zone: "Europe/London" });
  it("reports the worst due state, never a bare 'Recorded'", () => {
    expect(complianceSummary({ motExpiryDate: "2026-10-12", roadTaxRenewalDate: "2027-05-01" } as never, today)).toEqual({ label: "Overdue", tone: "danger" });
    expect(complianceSummary({ motExpiryDate: "2026-11-01", roadTaxRenewalDate: "2027-05-01" } as never, today)).toEqual({ label: "Due soon", tone: "warning" });
    expect(complianceSummary({ motExpiryDate: "2027-03-05", roadTaxRenewalDate: "2027-05-01" } as never, today)).toEqual({ label: "Current", tone: "ok" });
    expect(complianceSummary({ roadTaxRenewalDate: "2027-05-01" } as never, today)).toEqual({ label: "Partly recorded", tone: "warning" });
    expect(complianceSummary(null, today)).toEqual({ label: "Not recorded", tone: "empty" });
  });
});
