import { describe, expect, it } from "vitest";
import type { DriverSummaryItem } from "../types";
import { cardRows, recordedPaymentsPounds, revenueAnomaly } from "./DriverCards";

const row = (patch: Partial<DriverSummaryItem>) => ({ initials: "TI", fullName: "Tiago", active: true, hasAccount: true, completed: 15, revenuePounds: 2603, cashCollectedPounds: 1320, cardCollectedPounds: 940, bankCollectedPounds: 0, invoiceCollectedPounds: 325, ...patch }) as DriverSummaryItem;

describe("driver cards", () => {
  it("adds every recorded payment method, invoices included", () => {
    expect(recordedPaymentsPounds(row({ linkCollectedPounds: 18 }))).toBe(1320 + 940 + 325 + 18);
  });

  it("flags only totals that are implausibly far above recorded payments", () => {
    expect(revenueAnomaly(row({}))).toBe(false);
    expect(revenueAnomaly(row({ revenuePounds: 898990077.8, cashCollectedPounds: 9483.6, cardCollectedPounds: 7617, invoiceCollectedPounds: 0 }))).toBe(true);
    // An invoice-only driver with nothing recorded yet is not an anomaly below £10,000.
    expect(revenueAnomaly(row({ revenuePounds: 4000, cashCollectedPounds: 0, cardCollectedPounds: 0, invoiceCollectedPounds: 0 }))).toBe(false);
  });

  it("leaves out unassigned and account-less codes and searches by code, name, email, phone and van", () => {
    const rows = [row({}), row({ initials: "UNASSIGNED", fullName: "Unassigned" }), row({ initials: "XX", fullName: "Old code", hasAccount: false }), row({ initials: "KA", fullName: "Caio", email: "c@example.invalid", vanRegistration: "DV68UAF" })];
    expect(cardRows(rows, "").map(r => r.initials)).toEqual(["KA", "TI"]); // same job count: by name
    expect(cardRows(rows, "ka").map(r => r.initials)).toEqual(["KA"]);
    expect(cardRows(rows, "dv68").map(r => r.initials)).toEqual(["KA"]);
    expect(cardRows(rows, "cai").map(r => r.initials)).toEqual(["KA"]);
  });
});
