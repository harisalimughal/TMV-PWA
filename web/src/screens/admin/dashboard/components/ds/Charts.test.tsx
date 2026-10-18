import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartLegend, ChartPanel, DonutChart, Heatmap, KpiCard, RadialProgress, SemiGauge, Sparkline } from "./Charts";
import { DateRangePicker, dateRangeForPreset } from "../DateRangePicker";

describe("Sparkline", () => {
  it("draws nothing without at least two known values", () => {
    const { container } = render(<Sparkline values={[null, 4]} label="trend" />);
    expect(container.querySelector("svg")).toBeNull();
  });
  it("breaks the line at unknown values instead of dropping to zero", () => {
    const { container } = render(<Sparkline values={[1, 2, null, 3, 4]} label="trend" />);
    const d = container.querySelector("path[fill='none']")!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(2);
  });
});

describe("KpiCard", () => {
  it("puts the value at the same height with or without a comparison chip", () => {
    const { container } = render(<><KpiCard label="A" value={1} icon={<span />} visual={<span />} comparison={{ text: "+1", direction: "up", meaning: "good" }} /><KpiCard label="B" value={2} icon={<span />} visual={<span />} /></>);
    const rows = [...container.querySelectorAll(".tmv-gloss > div:nth-child(2)")];
    expect(rows).toHaveLength(2);
    for (const row of rows) { expect(row).toHaveClass("items-start"); expect(row).not.toHaveClass("items-end"); }
  });

  it("shows a comparison with a text label, not colour alone, and opens when clickable", () => {
    const open = vi.fn();
    render(<KpiCard label="Completed jobs" value={12} icon={<span />} comparison={{ text: "+2 vs the previous 7 days", direction: "up", meaning: "good" }} onOpen={open} openLabel="View completed jobs" />);
    expect(screen.getByText("+2 vs the previous 7 days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Completed jobs. View completed jobs" }));
    expect(open).toHaveBeenCalled();
  });
});

describe("ChartPanel", () => {
  it("lets a wide control group shrink inside the card instead of widening the page", () => {
    // Layout is checked in a real browser at 320 px; jsdom only sees the classes that allow it.
    render(<ChartPanel title="t" question="q" state="ready" actions={<div role="radiogroup" aria-label="Chart view" />}><div /></ChartPanel>);
    expect(screen.getByRole("radiogroup", { name: "Chart view" }).parentElement).toHaveClass("min-w-0", "max-w-full");
  });

  it("renders a panel-specific error with retry", () => {
    const retry = vi.fn();
    render(<ChartPanel title="Job activity" question="How is our workload changing?" state="error" error="Service down" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Service down");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
  it("offers the same numbers as a data table", () => {
    render(<ChartPanel title="Final charges" question="q" state="ready" table={{ caption: "Charges", columns: ["Period", "Amount"], rows: [["8 Oct", "£100.00"]] }}><div /></ChartPanel>);
    expect(screen.getByText("Show data table")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Charges" })).toBeInTheDocument();
  });
  it("shows an empty message rather than an empty chart", () => {
    render(<ChartPanel title="t" question="q" state="empty" emptyText="No completed jobs in this period."><div>chart</div></ChartPanel>);
    expect(screen.getByText("No completed jobs in this period.")).toBeInTheDocument();
    expect(screen.queryByText("chart")).not.toBeInTheDocument();
  });
});

describe("ChartLegend", () => {
  it("names every series in text beside its swatch", () => {
    render(<ChartLegend items={[{ label: "Completed", color: "#315EED", value: 4 }, { label: "Cancelled", color: "#94A3B8", value: 1 }]} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("overview date presets", () => {
  it("offers only Today, Yesterday and Last 7 days beside the two date fields", () => {
    render(<DateRangePicker presets="overview" {...dateRangeForPreset("7d")} onChange={vi.fn()} />);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Today", "Yesterday", "Last 7 days"]);
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Custom range|Last 30 days/ })).toBeNull();
  });
  it("leaves every preset unpressed when the dates match none (a custom range)", () => {
    render(<DateRangePicker presets="overview" from="2026-01-01T00:00:00.000Z" to="2026-01-20T23:59:59.999Z" onChange={vi.fn()} />);
    for (const name of ["Today", "Yesterday", "Last 7 days"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("DonutChart", () => {
  const segments = [{ key: "a", label: "Completed", value: 3, color: "red" }, { key: "b", label: "Cancelled", value: 0, color: "blue" }, { key: "c", label: "Scheduled", value: 1, color: "green" }];
  it("draws one arc per non-zero segment and states every value in its label", () => {
    const { container } = render(<DonutChart segments={segments} centerValue={4} centerLabel="Total jobs" label="Job status: Completed 3, Cancelled 0, Scheduled 1" />);
    expect(container.querySelectorAll("circle.tmv-ring-arc")).toHaveLength(2);
    expect(screen.getByRole("img", { name: /Completed 3, Cancelled 0, Scheduled 1/ })).toBeInTheDocument();
    expect(screen.getByText("Total jobs")).toBeInTheDocument();
  });
  it("draws only the track when there is nothing to show", () => {
    const { container } = render(<DonutChart segments={[{ key: "a", label: "A", value: 0, color: "red" }]} centerValue={0} centerLabel="Total jobs" label="No jobs" />);
    expect(container.querySelectorAll("circle.tmv-ring-arc")).toHaveLength(0);
  });
  it("notifies the active segment on hover", () => {
    const onActive = vi.fn();
    const { container } = render(<DonutChart segments={segments} onActive={onActive} centerValue={4} centerLabel="Total" label="mix" />);
    fireEvent.mouseEnter(container.querySelectorAll("circle.tmv-ring-arc")[0]);
    expect(onActive).toHaveBeenCalledWith("a");
  });
});

describe("RadialProgress and SemiGauge", () => {
  it("draws no arc for an unknown value (never zero)", () => {
    const { container } = render(<RadialProgress value={null} label="Unknown" />);
    expect(container.querySelector("circle.tmv-ring-arc")).toBeNull();
  });
  it("draws an arc for a known value", () => {
    const { container } = render(<RadialProgress value={0.5} label="50% complete" />);
    expect(container.querySelector("circle.tmv-ring-arc")).not.toBeNull();
  });
  it("labels the gauge with the underlying counts", () => {
    render(<SemiGauge value={0.5} label="1 of 2 tracked vehicles reported recently" />);
    expect(screen.getByRole("img", { name: "1 of 2 tracked vehicles reported recently" })).toBeInTheDocument();
  });
});

describe("Heatmap", () => {
  it("is a real table with a value for every weekday and hour", () => {
    render(<Heatmap caption="Jobs by weekday and hour" unit="job" grid={{ rowLabels: ["Mon", "Tue"], colLabels: ["09:00", "10:00"], values: [[2, 0], [0, 5]] }} />);
    const table = screen.getByRole("table", { name: "Jobs by weekday and hour" });
    expect(table).toHaveTextContent("Mon");
    expect(screen.getByTitle("Tue, 10:00: 5 jobs")).toHaveTextContent("5");
    expect(screen.getByTitle("Mon, 10:00: 0 jobs")).toBeInTheDocument();
  });
});
