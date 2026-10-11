import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminFilterBar } from "./AdminFilterBar";

describe("Consistent admin filter rows", () => {
  it("puts dates first while preserving the secondary control callbacks", () => {
    const change = vi.fn(), refresh = vi.fn();
    render(<AdminFilterBar dates={<input aria-label="Date" type="date" onChange={change} />} count="3 jobs">
      <input aria-label="Search" onChange={change} /><button onClick={refresh}>Refresh</button>
    </AdminFilterBar>);
    const dates = screen.getByRole("group", { name: "Date filters" });
    const controls = screen.getByRole("group", { name: "Other filters" });
    expect(dates.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dates).getByText("3 jobs")).toBeInTheDocument();
    fireEvent.change(within(controls).getByLabelText("Search"), { target: { value: "test" } });
    fireEvent.click(within(controls).getByRole("button", { name: "Refresh" }));
    expect(change).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
  });
  it("omits an empty second row and supports embedded table filters", () => {
    const { container } = render(<AdminFilterBar embedded dates={<input aria-label="Date" />} />);
    expect(screen.queryByRole("group", { name: "Other filters" })).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass("border-b");
    expect(container.firstChild).not.toHaveClass("border", "rounded-[6px]");
  });
});
