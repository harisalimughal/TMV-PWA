import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker, dateRangeForPreset } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("marks the active preset with aria-pressed and moves it with the selected range", () => {
    const change = vi.fn(), today = dateRangeForPreset("today");
    const { rerender } = render(<DateRangePicker {...today} onChange={change} />);
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    const yesterday = dateRangeForPreset("yesterday");
    expect(change).toHaveBeenCalledWith(yesterday.from, yesterday.to);
    rerender(<DateRangePicker {...yesterday} onChange={change} />);
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "true");
  });
  it("offers day-to-day presets for operational pages and no all-time shortcut by default", () => {
    render(<DateRangePicker onChange={vi.fn()} />);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Yesterday", "Today", "Tomorrow"]);
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });
  it("marks the selected preset the same way on every page (no filled button on the Overview)", () => {
    const overview = render(<DateRangePicker presets="overview" {...dateRangeForPreset("today")} onChange={vi.fn()} />);
    const selected = screen.getByRole("button", { name: "Today" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).not.toHaveClass("tmv-btn-primary");
    expect(selected).toHaveClass("text-admin-brand", "ring-1");
    overview.unmount();
  });

  it("keeps a whole date visible on phones and wraps instead of overflowing its card", () => {
    render(<DateRangePicker onChange={vi.fn()} />);
    // Layout is checked in a real browser (320-768 px); jsdom has no layout, so this pins the classes.
    for (const label of ["From date", "To date"]) expect(screen.getByLabelText(label)).toHaveClass("min-w-[132px]", "basis-0", "sm:w-[150px]");
    expect(screen.getByLabelText("From date").parentElement).toHaveClass("flex-wrap", "sm:flex-nowrap");
  });
  it("offers bounded look-back presets for reports, and All dates only when allowed", () => {
    const { rerender } = render(<DateRangePicker presets="retrospective" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Today", "Last 7 days", "This month", "Last month"]);
    rerender(<DateRangePicker presets="retrospective" allowAll onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All dates" })).toBeInTheDocument();
  });
  it("builds last month as the whole previous London calendar month", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    try { expect(dateRangeForPreset("lastMonth")).toEqual({ from: "2026-08-31T23:00:00.000Z", to: "2026-09-30T22:59:59.999Z" }); }
    finally { vi.useRealTimers(); }
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

  it("compact: the two date fields live behind a Custom range button, and presets still work", () => {
    const onChange = vi.fn();
    const range = dateRangeForPreset("today");
    render(<DateRangePicker compact allowAll from={range.from} to={range.to} onChange={onChange} />);
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Custom range/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Custom range/ }));
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-20" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByLabelText("From date")).not.toBeInTheDocument();
  });

  it("compact: shows the chosen custom range as the button label", () => {
    render(<DateRangePicker compact from="2026-10-04T23:00:00.000Z" to="2026-10-09T22:59:59.999Z" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /5 Oct – 9 Oct/ })).toBeInTheDocument();
  });
});
