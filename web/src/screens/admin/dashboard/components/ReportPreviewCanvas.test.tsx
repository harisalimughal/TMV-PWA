import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportPreviewCanvas } from "./ReportPreviewCanvas";

describe("Report preview zoom layout", () => {
  afterEach(() => vi.restoreAllMocks());
  it("reserves scaled width and height so zoomed content remains reachable instead of overflowing left", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(1800);
    const { container, rerender } = render(<ReportPreviewCanvas zoom={200}><p>Complete report content</p></ReportPreviewCanvas>);
    expect(container.querySelector(".report-preview-stage")).toHaveStyle({ width: "1200px", height: "3600px" });
    expect(container.querySelector(".report-preview-document")).toHaveStyle({ width: "600px", transform: "scale(2)" });
    rerender(<ReportPreviewCanvas zoom={50}><p>Complete report content</p></ReportPreviewCanvas>);
    expect(container.querySelector(".report-preview-stage")).toHaveStyle({ width: "300px", height: "900px" });
  });
});
