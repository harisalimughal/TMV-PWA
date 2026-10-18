import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentsTab, manualEntryWarning } from "./PaymentsTab";
import { sampleDriverReport } from "../../fixtures/driverReport.sample";

const gps = { loading: false, available: true, retry: vi.fn() };

describe("PaymentsTab driver-reported totals", () => {
  it("restores the live report's Manual entries (reported) and Outstanding from the backend fields", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    report.summary.paymentCards = { ...report.summary.paymentCards!, manualEntriesKnownPence: 36500, manualEntriesPence: 36500, manualEntryUnknownJobs: 0, manualEntryMissingJobs: 0, outstandingPence: 1250 };
    render(<PaymentsTab report={report} gps={gps} onJob={vi.fn()} onPage={vi.fn()} go={vi.fn()} />);
    const row = screen.getByRole("group", { name: "Driver-reported" });
    expect(within(row).getByText("Manual entries (reported)")).toBeInTheDocument();
    expect(within(row).getByText("£365.00")).toBeInTheDocument();
    expect(within(row).getByText("£12.50")).toBeInTheDocument();
  });

  it("shows Outstanding as not recorded rather than £0.00 when an entry is missing", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    report.summary.paymentCards = { ...report.summary.paymentCards!, manualEntriesKnownPence: 20000, manualEntriesPence: null, manualEntryUnknownJobs: 2, manualEntryMissingJobs: 1, outstandingPence: null };
    render(<PaymentsTab report={report} gps={gps} onJob={vi.fn()} onPage={vi.fn()} go={vi.fn()} />);
    const row = screen.getByRole("group", { name: "Driver-reported" });
    expect(within(row).getByText("£200.00")).toBeInTheDocument();
    expect(within(row).getByText("1 missing entry · 1 invalid entry")).toBeInTheDocument();
    expect(within(row).getByText("Not recorded")).toBeInTheDocument();
  });

  it("counts missing and invalid entries the way the live report did", () => {
    expect(manualEntryWarning(undefined)).toBe("");
    expect(manualEntryWarning({ manualEntryUnknownJobs: 3 } as never)).toBe("3 missing entries");
    expect(manualEntryWarning({ manualEntryUnknownJobs: 3, manualEntryMissingJobs: 1 } as never)).toBe("1 missing entry · 2 invalid entries");
  });
});
