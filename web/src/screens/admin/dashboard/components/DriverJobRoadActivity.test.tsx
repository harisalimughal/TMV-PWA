import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriverJobRoadActivity } from "./DriverJobRoadActivity";
import { roadZoneLabel } from "./DriverRoadAlerts";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
describe("Complete job-level GPSLive activity", () => {
  it("uses all embedded job alerts rather than the paginated range list and retains detailed alerts", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", pageSize: 1, roadAlertsPage: 2 });
    const job = report.jobs.items[0], original = job.roadAlerts![0];
    job.roadAlerts = [original, { ...original, id: "second", estimatedPence: 0, chargeable: false }];
    const { container } = render(<DriverJobRoadActivity job={job} report={report} onJob={vi.fn()} />);
    const tunnel = screen.getByRole("region", { name: `Tunnel activity for ${job.jobId}` });
    expect(tunnel.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(within(tunnel).getByText("Expected")).toBeInTheDocument();
    expect(container.querySelector(".rpt-pager")).toBeNull();
    expect(tunnel).toHaveTextContent("£13.60");
    fireEvent.click(within(tunnel).getAllByRole("button", { name: roadZoneLabel(original) })[0]);
    expect(within(screen.getByRole("dialog")).getByText("Zone entered")).toBeInTheDocument();
  });
  it("does not present missing job-level data as a proven zero", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    render(<DriverJobRoadActivity job={{ ...report.jobs.items[0], roadAlerts: undefined }} report={report} onJob={vi.fn()} />);
    expect(screen.getByText("Job-level alert history unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("£0.00")).not.toBeInTheDocument();
  });
});
