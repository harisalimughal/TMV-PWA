import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./ds/Drawer";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { paperJobSample } from "../../../../../test/reportPreview.sample";

/** The job dialog opens the PDF preview on top of itself (JobDetailModal.tsx). */
function DrawerWithPreview({ closeDrawer, closePreview }: { closeDrawer: () => void; closePreview: () => void }) {
  return (
    <>
      <Drawer open title="Job UI-JOB" onClose={closeDrawer}>
        <button type="button">Download PDF</button>
      </Drawer>
      <PdfPreviewModal job={paperJobSample} isOpen onClose={closePreview} onDownload={() => {}} />
    </>
  );
}

describe("PdfPreviewModal over the job drawer", () => {
  it("closes only the preview on Escape, leaving the job drawer open", () => {
    const closeDrawer = vi.fn();
    const closePreview = vi.fn();
    render(<DrawerWithPreview closeDrawer={closeDrawer} closePreview={closePreview} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closePreview).toHaveBeenCalledOnce();
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it("keeps Tab focus inside the preview instead of jumping back into the drawer", () => {
    render(<DrawerWithPreview closeDrawer={() => {}} closePreview={() => {}} />);
    const preview = screen.getByRole("dialog", { name: "Report preview" });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(preview.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(preview.contains(document.activeElement)).toBe(true);
  });
});
