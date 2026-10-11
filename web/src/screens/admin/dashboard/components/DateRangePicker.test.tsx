import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker, dateRangeForPreset } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("highlights the default Today range immediately and moves the highlight with the selected range", () => {
    const change = vi.fn(), today = dateRangeForPreset("today");
    const { rerender } = render(<DateRangePicker {...today} onChange={change} />);
    const active = screen.getByRole("button", { name: "Today" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active).toHaveClass("bg-admin-brand", "text-white", "font-bold");
    expect(active).not.toHaveClass("font-medium");
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    const yesterday = dateRangeForPreset("yesterday");
    expect(change).toHaveBeenCalledWith(yesterday.from, yesterday.to);
    rerender(<DateRangePicker {...yesterday} onChange={change} />);
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveClass("bg-admin-brand", "text-white");
  });
  it("shows bounded date presets and no all-time shortcut", () => {
    render(<DateRangePicker onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "All Time" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomorrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 Days" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "30 Days" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This Month" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last Month" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This Week" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("builds the tomorrow preset as tomorrow's full day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));

    expect(dateRangeForPreset("tomorrow")).toEqual({
      from: "2026-09-29T23:00:00.000Z",
      to: "2026-09-30T22:59:59.999Z"
    });

    vi.useRealTimers();
  });
  it("uses seven London calendar days including today, including DST change", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    expect(dateRangeForPreset("7d")).toEqual({ from: "2026-10-18T23:00:00.000Z", to: "2026-10-25T23:59:59.999Z" });
    vi.useRealTimers();
  });
  it("includes the complete Today interval as the final day of 7 Days", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T07:00:00Z"));
    try {
      const today = dateRangeForPreset("today"), week = dateRangeForPreset("7d");
      expect(week.from).toBe("2026-10-04T23:00:00.000Z");
      expect(week.to).toBe(today.to);
      expect(Date.parse(week.from!)).toBeLessThan(Date.parse(today.from!));
      expect(Date.parse(week.to!)).toBeGreaterThan(Date.parse("2026-10-11T22:59:59Z"));
    } finally { vi.useRealTimers(); }
  });
});
