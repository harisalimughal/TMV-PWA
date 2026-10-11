import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriverRoadAlerts, roadZoneLabel } from "./DriverRoadAlerts";
import { sampleDriverReport } from "../fixtures/driverReport.sample";

describe("GPSLive tunnel charge wording", () => {
  it.each(["congestion", "tunnel"] as const)("shows the current %s charging schedule in a yellow card", async type => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: type });
    render(<DriverRoadAlerts report={report} type={type} onJob={vi.fn()} onPage={vi.fn()} />);
    const card = screen.getByRole("region", { name: "Chargeable Times" });
    expect(card).toHaveClass("rpt-chargeable-times");
    expect(card).toHaveTextContent("London time");
    if (type === "tunnel") {
      expect(card).toHaveTextContent("Monday - Sunday"); expect(card).toHaveTextContent("6:00 AM - 10:00 PM");
      expect(card.querySelectorAll("dt")).toHaveLength(1);
    } else {
      expect(card).toHaveTextContent("Monday - Friday"); expect(card).toHaveTextContent("7:00 AM - 6:00 PM");
      expect(card).toHaveTextContent("Saturday - Sunday"); expect(card).toHaveTextContent("12:00 PM - 6:00 PM");
      expect(card.querySelectorAll("dt")).toHaveLength(2);
    }
  });
  it("shows tunnel totals and fees without estimate wording, retaining rate provenance and alert details", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "tunnel" });
    report.roadAlerts!.items[0].rateBasis = "Current Pricing Settings estimate";
    const before = JSON.stringify(report);
    const onJob = vi.fn();
    const { container } = render(<DriverRoadAlerts report={report} type="tunnel" onJob={onJob} onPage={vi.fn()} />);
    expect(screen.getByText("Total Tunnel Charges")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tunnel Fee" })).toBeInTheDocument();
    expect(screen.getByText("Current Pricing Settings")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/estimate/i);
    fireEvent.click(screen.getByRole("button", { name: report.roadAlerts!.items[0].jobId! }));
    expect(onJob).toHaveBeenCalledWith(report.roadAlerts!.items[0].jobId);
    fireEvent.click(screen.getAllByRole("button", { name: roadZoneLabel(report.roadAlerts!.items[0]) })[0]);
    const modal = screen.getByRole("dialog");
    expect(modal.textContent).not.toMatch(/estimate/i);
    expect(within(modal).getByText("Zone entered")).toBeInTheDocument();
    expect(JSON.stringify(report)).toBe(before);
  });
  it("excludes unlinked rows from the table rather than inventing job links", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "tunnel" });
    report.roadAlerts!.items = [{ ...report.roadAlerts!.items[0], estimatedPence: null, jobId: null }];
    report.roadAlerts!.total = 0;
    report.roadAlertSummary = { entries: 0, chargeableEntries: 0, estimatedKnownPence: 0, unpricedEntries: 0 };
    render(<DriverRoadAlerts report={report} type="tunnel" onJob={vi.fn()} onPage={vi.fn()} />);
    expect(screen.getByText("No zone-entry alerts for this driver and date range.")).toBeInTheDocument();
    expect(screen.queryByText("Fees unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("No matching job")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlinked alerts" })).not.toBeInTheDocument();
  });
  it("does not change congestion wording", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "congestion" });
    render(<DriverRoadAlerts report={report} type="congestion" onJob={vi.fn()} onPage={vi.fn()} />);
    expect(screen.getByText("Estimated Charges")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estimated fee" })).toBeInTheDocument();
  });
  it.each(["congestion", "tunnel"] as const)("cleans zone labels and removes Exited from %s without altering stored alerts", async type => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: type });
    const row = report.roadAlerts!.items[0]; row.zone = "Congestion Zone NE - Charges - Alerts";
    const before = JSON.stringify(report);
    render(<DriverRoadAlerts report={report} type={type} onJob={vi.fn()} onPage={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Zones" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Zones" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Exited" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Congestion Zone NE" })).toBeInTheDocument();
    expect(JSON.stringify(report)).toBe(before);
  });
  it("states the reason a linked fee is unavailable instead of showing a generic missing calculation", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", activityScheme: "tunnel" });
    report.roadAlerts!.items = [{ ...report.roadAlerts!.items[0], estimatedPence: null, feeReason: "Pricing rate unavailable" }];
    render(<DriverRoadAlerts report={report} type="tunnel" onJob={vi.fn()} onPage={vi.fn()} />);
    expect(screen.getByText("Pricing rate unavailable")).toBeInTheDocument();
  });
});
