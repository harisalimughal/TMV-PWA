import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateRangePicker } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("shows bounded date presets and no all-time shortcut", () => {
    render(<DateRangePicker onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "All Time" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 Days" })).toBeInTheDocument();
  });
});
