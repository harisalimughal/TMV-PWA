import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const props = () => ({ isOpen: true, onClose: vi.fn(), onSelectSection: vi.fn() });
describe("Search-only Logs destination", () => {
  it("keeps Logs out of default suggestions and partial/unrelated searches", () => {
    render(<CommandPalette {...props()} />);
    const input = screen.getByRole("textbox");
    for (const search of ["", "l", "lo", "log", "logging", "server logs", "logs extra", "system"]) {
      fireEvent.change(input, { target: { value: search } });
      expect(screen.queryByRole("button", { name: /^Logs/ })).not.toBeInTheDocument();
    }
  });
  it.each(["logs", "LOGS", " logs "])("opens Logs only for the exact normalized word %j", search => {
    const handlers = props();
    render(<CommandPalette {...handlers} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: search } });
    fireEvent.click(screen.getByRole("button", { name: /^Logs/ }));
    expect(handlers.onSelectSection).toHaveBeenCalledExactlyOnceWith("logs");
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
  it("clears the previous search when reopened so Logs is not a default suggestion", () => {
    const handlers = props();
    const { rerender } = render(<CommandPalette {...handlers} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "logs" } });
    expect(screen.getByRole("button", { name: /^Logs/ })).toBeInTheDocument();
    rerender(<CommandPalette {...handlers} isOpen={false} />);
    rerender(<CommandPalette {...handlers} isOpen />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByRole("button", { name: /^Logs/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Overview/ })).toBeInTheDocument();
  });
});
