import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import { loadDriverBreakdown } from "./driverBreakdown";
import { PaperDriverBreakdown } from "./PaperDriverBreakdown";
import adminCss from "../adminTheme.css?raw";

const load = vi.fn((initials: string, query: Record<string, string | number>) => sampleDriverReport(initials, { ...query, pageSize: 4 }));
const build = () => loadDriverBreakdown("TI", "2026-10-05", "2026-10-11", { load, now: () => new Date("2026-10-15T09:00:00Z") });

describe("Driver Breakdown PDF", () => {
  it("reads every job page and each scheme's zone events from the same report endpoint", async () => {
    load.mockClear();
    const data = await build();
    expect(data.jobs).toHaveLength(data.jobsTotal);
    expect(new Set(data.jobs.map(job => job.jobId)).size).toBe(data.jobsTotal);
    expect(load.mock.calls.every(([initials, query]) => initials === "TI" && query.detail === "full")).toBe(true);
    const schemes = load.mock.calls.map(([, query]) => query.activityScheme);
    expect(schemes).toEqual(expect.arrayContaining(["all", "tunnel", "congestion"]));
    expect(data.tunnel.rows.every(row => row.type === "tunnel")).toBe(true);
    expect(data.congestion.rows.every(row => row.type === "congestion")).toBe(true);
  });

  it("prints the six sections in the deployed order with every job", async () => {
    const data = await build();
    render(<PaperDriverBreakdown data={data} />);
    const doc = screen.getByRole("article", { name: /Driver Breakdown/ });
    const headings = within(doc).getAllByRole("heading", { level: 2 }).map(h => h.textContent?.replace(/^\d+/, ""));
    expect(headings).toEqual(["Performance & Timings", "Payments", "Jobs", "Comparison", "Tunnel Charges", "Congestion Charges"]);
    const references = Array.from(doc.querySelectorAll("td,th,span,a,button")).filter(node => node.childElementCount === 0).map(node => node.textContent?.trim());
    for (const job of data.jobs) expect(references.filter(reference => reference === job.jobId).length).toBeGreaterThanOrEqual(5);
    expect(within(doc).getByText("Total recorded payments")).toBeInTheDocument();
    expect(doc.querySelector("style")?.textContent).toContain('"Page " counter(page) " of " counter(pages)');
  });

  it("shows a missing driver submission as such, never as £0.00", async () => {
    const data = await build();
    data.jobs[0] = { ...data.jobs[0], manualDetails: null, manualStatus: "pending" };
    render(<PaperDriverBreakdown data={data} />);
    const row = screen.getAllByText(data.jobs[0].jobId).map(cell => cell.closest("tr")!).find(tr => tr.textContent?.includes("Pending submission"))!;
    expect(row).toBeTruthy();
    expect(within(row).queryByText("£0.00")).not.toBeInTheDocument();
  });

  it("keeps paper light in print even when Midnight sets an inline color-scheme", () => {
    expect(adminCss).toContain("@media print { html.tmv-admin { color-scheme: light !important; } }");
  });
});
