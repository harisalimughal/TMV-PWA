import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateRangePicker, dateRangeForPreset } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("shows bounded date presets and no all-time shortcut", () => {
    render(<DateRangePicker onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "All Time" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomorrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "30 Days" })).not.toBeInTheDocument();
  });

  it("builds the tomorrow preset as tomorrow's full day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));

    expect(dateRangeForPreset("tomorrow")).toEqual({
      from: "2026-09-30T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z"
    });

    vi.useRealTimers();
  });
});
