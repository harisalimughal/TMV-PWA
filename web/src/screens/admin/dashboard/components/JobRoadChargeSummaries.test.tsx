import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobRoadChargeSummaries } from "./JobRoadChargeSummaries";
import { sampleDriverReport } from "../fixtures/driverReport.sample";

describe("Compact job road-charge summaries", () => {
  it("uses all embedded job records, excludes other/unlinked jobs and keeps three cards per section", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", pageSize: 1, roadAlertsPage: 2 });
    const job = report.jobs.items[0], original = job.roadAlerts![0];
    job.roadAlerts = [original, { ...original, id: "second" }, { ...original, id: "other", jobId: "OTHER" }, { ...original, id: "unlinked", jobId: null },
      { ...original, id: "congestion", type: "congestion", estimatedPence: 1800 }, { ...original, id: "congestion-repeat", type: "congestion", chargeable: false, estimatedPence: 0 }];
    const { container } = render(<JobRoadChargeSummaries job={job} />);
    const tunnel = screen.getByRole("region", { name: `Tunnel charges for ${job.jobId}` });
    const congestion = screen.getByRole("region", { name: `Congestion charges for ${job.jobId}` });
    expect(tunnel.querySelectorAll(".rpt-metric")).toHaveLength(3);
    expect(congestion.querySelectorAll(".rpt-metric")).toHaveLength(3);
    expect(within(tunnel).getByText("£27.20")).toBeInTheDocument();
    expect(within(congestion).getByText("£18.00")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByText("Chargeable Times")).not.toBeInTheDocument();
  });
  it("does not turn missing job history into zero crossings or zero fees", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    render(<JobRoadChargeSummaries job={{ ...report.jobs.items[0], roadAlerts: undefined }} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(6);
    expect(screen.queryByText("£0.00")).not.toBeInTheDocument();
  });
});
