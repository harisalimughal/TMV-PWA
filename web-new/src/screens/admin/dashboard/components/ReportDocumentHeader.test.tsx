import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportDocumentHeader, ReportDocumentFooter, ReportRecordMeta } from "./ReportDocumentHeader";
describe("Shared formal report identity", () => {
  it("retains first-page record identity without repeated page headers or footer timezone", () => {
    const { container } = render(<><ReportDocumentHeader title="Liability Report" reference="FULL-REFERENCE-123" page={1} /><ReportDocumentHeader title="Liability Report" reference="FULL-REFERENCE-123" page={2} /><ReportRecordMeta name="Sample Driver" initials="QA" timestamp="10 Oct 2026, 10:00" reference="FULL-REFERENCE-123" jobId="JOB-456" /><ReportDocumentFooter reference="FULL-REFERENCE-123" page={2} total={2} /></>);
    expect(screen.getAllByRole("img", { name: "TMV company logo" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Liability Report" })).toHaveLength(1);
    expect(screen.getByText("Job ID")).toBeInTheDocument(); expect(screen.getByText("JOB-456")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Sample Driver (QA)")).toBeInTheDocument();
    expect(container.querySelector("header")).not.toHaveTextContent("FULL-REFERENCE-123");
    expect(container.querySelector("footer")).not.toHaveTextContent("London time");
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(container.querySelector(".report-record-meta")).toHaveTextContent("10 Oct 2026, 10:00, London time");
    expect(container.querySelector(".report-record-meta")).not.toHaveTextContent("Europe/London");
  });
});
