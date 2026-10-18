import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal backdrop dismissal", () => {
  it("keeps focus on the input across edits and closes only the top dialog", () => {
    const outerClose = vi.fn();
    function Editor() {
      const [value, setValue] = useState(""); const [confirm, setConfirm] = useState(false);
      return <><Modal open title="Editor" onClose={() => outerClose()}><input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} /><button onClick={() => setConfirm(true)}>Confirm</button></Modal>
        <Modal open={confirm} title="Confirmation" onClose={() => setConfirm(false)}>Details</Modal></>;
    }
    render(<Editor />);
    const field = screen.getByRole("textbox"); field.focus(); fireEvent.change(field, { target: { value: "typing" } });
    expect(field).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Confirmation" })).not.toBeInTheDocument();
    expect(outerClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("moves initial keyboard focus to the first control instead of letting Tab escape", () => {
    render(<Modal open title="Keyboard" onClose={() => {}}><button>Last action</button></Modal>);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();
  });
  it("closes once when the backdrop itself is clicked, not when the message is clicked", () => {
    const close = vi.fn(); const { container } = render(<Modal open title="Details" onClose={close}><p>Message text</p></Modal>);
    fireEvent.mouseDown(screen.getByText("Message text")); expect(close).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body.querySelector('[aria-hidden="true"]')!); expect(close).toHaveBeenCalledOnce();
  });
  it("keeps non-dismissible forms protected from backdrop and Escape", () => {
    const close = vi.fn(); const { container } = render(<Modal open dismissible={false} title="Saving" onClose={close}>Pending save</Modal>);
    fireEvent.mouseDown(document.body.querySelector('[aria-hidden="true"]')!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
