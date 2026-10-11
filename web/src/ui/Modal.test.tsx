import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal backdrop dismissal", () => {
  it("closes once when the backdrop itself is clicked, not when the message is clicked", () => {
    const close = vi.fn(); const { container } = render(<Modal open title="Details" onClose={close}><p>Message text</p></Modal>);
    fireEvent.mouseDown(screen.getByText("Message text")); expect(close).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('[aria-hidden="true"]')!); expect(close).toHaveBeenCalledOnce();
  });
  it("keeps non-dismissible forms protected from backdrop and Escape", () => {
    const close = vi.fn(); const { container } = render(<Modal open dismissible={false} title="Saving" onClose={close}>Pending save</Modal>);
    fireEvent.mouseDown(container.querySelector('[aria-hidden="true"]')!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
