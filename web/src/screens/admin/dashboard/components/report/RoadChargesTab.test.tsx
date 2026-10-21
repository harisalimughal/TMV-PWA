import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoadChargesTab, eventStatus } from "./RoadChargesTab";
import { sampleDriverReport } from "../../fixtures/driverReport.sample";
import type { ReportRoadAlert } from "../../driverReport.types";

const gps = { loading: false, available: true, retry: vi.fn() };
async function reportWithUnlinked() {
  const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
  const [first, second, ...rest] = report.roadAlerts!.items;
  report.roadAlerts = { ...report.roadAlerts!, items: [{ ...first, jobId: null }, second, ...rest], page: 1, pageSize: report.roadAlerts!.items.length, total: report.roadAlerts!.items.length + 30 };
  return report;
}
const renderTab = (report: Awaited<ReturnType<typeof sampleDriverReport>>, patch: Record<string, unknown> = {}) => {
  const props = { report, gps, onJob: vi.fn(), onPage: vi.fn(), go: vi.fn(), roadType: "tunnel" as "tunnel" | "congestion", view: "events" as const, ...patch };
  render(<RoadChargesTab {...props} />);
  return props;
};

describe("RoadChargesTab", () => {
  it.each([true, false])("keeps manual road charges and job actions available when GPS is loading=%s", async loading => {
    const report = await reportWithUnlinked();
    report.summary.manualRoadChargeTotals = {
      tunnel: { knownPence: 777, knownJobs: 1, missingJobs: 0, unavailableJobs: 0 },
      congestion: { knownPence: 0, knownJobs: 1, missingJobs: 0, unavailableJobs: 0 }
    };
    renderTab(report, { view: "jobs", gps: { loading, available: false, error: loading ? undefined : "GPS timed out", retry: vi.fn() } });
    expect(screen.getByText("£7.77")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Driver reported" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open job / })[0]).toBeEnabled();
    expect(screen.getByRole("region", { name: "Chargeable times" })).toBeInTheDocument();
    if (loading) expect(screen.getAllByText("Loading GPS…").length).toBeGreaterThan(0);
    else expect(screen.getByText(/GPS timed out/)).toBeInTheDocument();
  });
  it("keeps events with no linked job visible and says they need a match", async () => {
    renderTab(await reportWithUnlinked());
    expect(screen.getByText("1 event on this page needs a job match")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Zone events" });
    expect(within(table).getByText("Needs job match")).toBeInTheDocument();
    expect(within(table).getByText("No job linked")).toBeInTheDocument();
  });

  it("pages through the server's full event count, not only linked rows", async () => {
    const report = await reportWithUnlinked();
    const props = renderTab(report);
    const pages = screen.getByRole("navigation", { name: "event pages" });
    expect(within(pages).getByText(new RegExp(`of ${report.roadAlerts!.total} events`))).toBeInTheDocument();
    fireEvent.click(within(pages).getByRole("button", { name: "Next page" }));
    expect(props.onPage).toHaveBeenCalledWith("roadAlerts", 2);
  });

  it("labels each scheme's totals and shows its chargeable times", async () => {
    const report = await reportWithUnlinked();
    renderTab(report);
    expect(screen.getByText("Tunnel zone entries")).toBeInTheDocument();
    expect(screen.getByText("Chargeable passages")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Chargeable times" })).getByText("6:00 AM – 10:00 PM")).toBeInTheDocument();
  });

  it("gives congestion its own labels and weekday / weekend hours", async () => {
    renderTab(await reportWithUnlinked(), { roadType: "congestion" });
    expect(screen.getByText("Congestion zone entries")).toBeInTheDocument();
    expect(screen.getByText("Chargeable jobs")).toBeInTheDocument();
    const times = screen.getByRole("region", { name: "Chargeable times" });
    expect(within(times).getByText("7:00 AM – 6:00 PM")).toBeInTheDocument();
    expect(within(times).getByText("12:00 PM – 6:00 PM")).toBeInTheDocument();
  });

  it("keeps charge rules in a disclosure", async () => {
    renderTab(await reportWithUnlinked());
    expect(screen.getByText("View charge rules").closest("details")).not.toHaveAttribute("open");
  });

  it("does not claim there were no entries when tracker coverage is partial", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    report.roadAlerts = { ...report.roadAlerts!, items: [], total: 0 };
    report.gpsSummary = { ...report.gpsSummary!, coverage: "partial" };
    renderTab(report);
    expect(screen.getByText(/this does not prove there were no entries/)).toBeInTheDocument();
  });

  it("shows tracker failure as unknown with a retry, not as zero entries", async () => {
    const retry = vi.fn();
    renderTab(await reportWithUnlinked(), { gps: { loading: false, available: false, error: "Tracker down", retry } });
    expect(screen.getByText(/No entries can be confirmed or ruled out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("eventStatus", () => {
  const row = (patch: Partial<ReportRoadAlert>) => ({ jobId: "J1", estimatedPence: 1800, inChargeableHours: true, chargeable: true, ...patch }) as ReportRoadAlert;
  it("orders job match before fee and hours", () => {
    expect(eventStatus(row({ jobId: null })).label).toBe("Needs job match");
    expect(eventStatus(row({ estimatedPence: null })).label).toBe("Fee not calculable");
    expect(eventStatus(row({ inChargeableHours: false })).label).toBe("Outside charging hours");
    expect(eventStatus(row({})).label).toBe("Chargeable");
  });
});
