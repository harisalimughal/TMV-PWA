import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaperScenarioReport, scenarioPhotoPages } from "./PaperScenarioReport";
import { DOCUMENT_TEMPLATES } from "../reports/documentTemplates";

const item = { id: "QA-SCENARIO", jobId: "QA-JOB", timestamp: "2026-10-10T09:00:00Z", driver: "QA",
  clientName: "Sample Customer", clientPhone: "020 0000 0000", clientEmail: "customer@example.invalid", containerNumber: "CONTAINER-100",
  address: "10 Example Road, Building A, Floor 3, London", damageCategories: "Recorded item condition", rawRecord: {},
  photos: [{ fileId: "photo-1", thumbUrl: "/qa-photo-1.png", capturedAt: "2026-10-10T09:05:00Z", location: { lat: 51.5, lng: -0.1 }, locationName: "Example Road" },
    { fileId: "photo-2", thumbUrl: "/qa-photo-2.png", capturedAt: "2026-10-10T09:10:00Z" }],
  signature: { url: "/qa-signature.png", capturedAt: "2026-10-10T09:15:00Z" } };
describe("Scenario report presentation", () => {
  it.each(["checkin", "checkout", "parking", "liability"])("uses identical %s content for preview and PDF print source", kind => {
    const preview = render(<PaperScenarioReport item={item} kind={kind} isPreview generatedAt="2026-10-15T10:00:00Z" />);
    const printable = render(<PaperScenarioReport item={item} kind={kind} generatedAt="2026-10-15T10:00:00Z" />);
    expect(preview.container.textContent).toBe(printable.container.textContent);
    expect(preview.container.querySelectorAll(".report-record-meta")).toHaveLength(1);
    expect(printable.container.querySelectorAll(".report-page-footer")).toHaveLength(2);
  });
  it.each([["checkin", "Storage Check-in"], ["checkout", "Storage Check-out"], ["parking", "Parking Liability Notice"], ["liability", "Liability Report"]])("keeps %s information while showing the main heading only once", (kind, title) => {
    const before = JSON.stringify(item);
    const { container } = render(<PaperScenarioReport item={item} kind={kind} isPreview />);
    expect(screen.getAllByRole("heading", { name: title })).toHaveLength(1);
    expect(screen.queryByText("THE MAN VAN")).not.toBeInTheDocument();
    expect(screen.getAllByText("020 3773 9113")).toHaveLength(1);
    expect(screen.getAllByText(item.clientName).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: `${title} Evidence 1` })).toHaveAttribute("src", "/qa-photo-1.png");
    expect(screen.getByRole("img", { name: `${title} Evidence 2` })).toHaveAttribute("src", "/qa-photo-2.png");
    expect(screen.getByRole("img", { name: "Client Signature" })).toHaveAttribute("src", "/qa-signature.png");
    expect(container.querySelectorAll(".report-preview-page")).toHaveLength(2);
    expect(container.querySelectorAll(".report-document-continuation")).toHaveLength(0);
    if (kind === "parking") expect(screen.getByText(/In the event a fine is received/)).toBeInTheDocument();
    if (kind === "liability") expect(screen.getByText(item.damageCategories)).toBeInTheDocument();
    if (kind === "checkin" || kind === "checkout") expect(screen.getByText(item.containerNumber)).toBeInTheDocument();
    expect(JSON.stringify(item)).toBe(before);
  });

  it("packs photos four to a page instead of one per page", () => {
    expect(scenarioPhotoPages([1, 2, 3, 4, 5]).map(page => page.length)).toEqual([4, 1]);
    const many = { ...item, photos: Array.from({ length: 6 }, (_, index) => ({ fileId: `p${index}`, thumbUrl: `/p${index}.png` })) };
    const { container } = render(<PaperScenarioReport item={many} kind="liability" isPreview />);
    expect(container.querySelectorAll(".report-preview-page")).toHaveLength(3);
    expect(screen.getByText("(continued)")).toBeInTheDocument();
  });

  it("prints one page and says Not recorded when photos and details are missing", () => {
    const bare = { id: "R-1", timestamp: "2026-10-10T09:00:00Z", rawRecord: {}, photos: [], signature: null };
    const { container } = render(<PaperScenarioReport item={bare} kind="checkin" isPreview />);
    expect(container.querySelectorAll(".report-preview-page")).toHaveLength(1);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(3);
    expect(screen.getByText("Not signed")).toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
    expect(screen.getByText(/no photos attached/)).toBeInTheDocument();
  });

  it.each(["checkin", "checkout", "parking", "liability"] as const)("prints only the %s wording, verbatim", kind => {
    const { container } = render(<PaperScenarioReport item={item} kind={kind} isPreview />);
    const text = container.textContent || "";
    const own = DOCUMENT_TEMPLATES[kind];
    if (own.declaration) expect(text).toContain(own.declaration);
    if (own.notice) expect(text).toContain(own.notice.text);
    for (const other of Object.values(DOCUMENT_TEMPLATES).filter(template => template.scenario !== kind)) {
      if (other.declaration) expect(text).not.toContain(other.declaration);
      if (other.notice) expect(text).not.toContain(other.notice.text);
    }
    expect(text).toContain(`template ${own.id} v${own.version}`);
    expect(text).not.toContain("fines typically start at GBP 60");
  });

  it("adds the overloading waiver only when Van Overloaded was recorded", () => {
    const waiver = DOCUMENT_TEMPLATES.liability.conditionalNotice!.text;
    const { container, rerender } = render(<PaperScenarioReport item={{ ...item, damageCategories: "Walls | Van Overloaded" }} kind="liability" isPreview />);
    expect(container.textContent).toContain(waiver);
    rerender(<PaperScenarioReport item={item} kind="liability" isPreview />);
    expect(container.textContent).not.toContain(waiver);
  });
});
