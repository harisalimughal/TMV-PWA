import React from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubmissionDetailDrawer } from "./SubmissionDetailDrawer";
import { paperJobSample, paperScenarioSample } from "../../../../../test/reportPreview.sample";

vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), saveJobReview: vi.fn(), deleteEvidencePhoto: vi.fn() }));
describe("Submission document preview", () => {
  it("opens and previews a historical job with null reported overtime without crashing", () => {
    const job = { ...paperJobSample, timeBilling: null, bookedMinutes: 180, actualMinutes: 44, driverReportedOvertimeMinutes: null } as unknown as typeof paperJobSample;
    const before = JSON.stringify(job);
    const { container } = render(<SubmissionDetailDrawer job={job} isOpen onClose={vi.fn()} />);
    const view = within(container);
    fireEvent.click(view.getByRole("button", { name: "Preview PDF" }));
    expect(view.getByRole("heading", { name: "Job Completed" })).toBeInTheDocument();
    expect(view.queryByText("Driver-reported extra time")).not.toBeInTheDocument();
    expect(JSON.stringify(job)).toBe(before);
  });
  it("keeps scenario editing/activity available in form mode but clears them from preview mode", () => {
    const { container } = render(<SubmissionDetailDrawer job={paperScenarioSample as any} kind="parking" isOpen onClose={vi.fn()} />);
    const view = within(container);
    expect(view.getByText("Manager fields")).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "Preview PDF" }));
    expect(view.queryByText("Manager fields")).not.toBeInTheDocument();
    expect(view.getByRole("heading", { name: "Parking Liability Notice" })).toBeInTheDocument();
    expect(container.querySelector(".report-preview-footer")?.closest(".report-preview-canvas")).toBeNull();
    expect(view.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "Back to Form" }));
    expect(view.getByText("Manager fields")).toBeInTheDocument();
  });
  it("preserves finished-job values while zooming without mutating the job", () => {
    const before = JSON.stringify(paperJobSample);
    const { container } = render(<SubmissionDetailDrawer job={paperJobSample} isOpen onClose={vi.fn()} />);
    const view = within(container); fireEvent.click(view.getByRole("button", { name: "Preview PDF" }));
    expect(view.getAllByText("£286.60").length).toBeGreaterThan(0); expect(view.getAllByText("£250.00").length).toBeGreaterThan(0);
    expect(view.getAllByRole("heading", { name: "Job Completed" })).toHaveLength(1);
    fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
    expect(view.getByText("110%")).toBeInTheDocument();
    expect(container.querySelector(".report-preview-document")).toHaveStyle({ transform: "scale(1.1)" });
    expect(JSON.stringify(paperJobSample)).toBe(before);
  });
});
