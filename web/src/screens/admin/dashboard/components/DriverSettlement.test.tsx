import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverSettlement } from "./DriverSettlement";
import type { DriverSummaryItem } from "../types";

const mocks = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
const driver = (initials: string, fullName: string) => ({ initials, fullName, completed: 1, hasAccount: true, active: true,
  totalChargesPounds: 100, revenuePounds: 100, totalCollectionsPounds: 100, invoiceCollectedPounds: 0,
  totalDurationMinutes: 60, movingKnownSeconds: 1800, movingUnknownJobs: 0, movingPartialJobs: 0, overtimeMinutes: 90, reviewSentCount: 1, reviewNotSentCount: 0 } as DriverSummaryItem);
const drivers = [driver("ZZ", "Zara"), driver("MA", "Alex"), driver("AB", "Alex")];

describe("Driver Breakdown filter", () => {
  it("shows only drivers with finished data and preserves the selector for an empty driver", () => {
    mocks.query = { data: { drivers: [driver("AB", "Alex"), { ...driver("WD", "Waiting Driver"), completed: 0 }] }, isSuccess: true };
    const { container } = render(<DriverSettlement />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "WD" } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(screen.getByText("No finished job data")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("WD");
  });
  beforeEach(() => { mocks.query = { data: { drivers }, isSuccess: true, isLoading: false, isError: false }; });
  it("only shows the same account-backed roster as Drivers, excluding historical initials and UNASSIGNED", () => {
    mocks.query = { ...mocks.query, data: { drivers: [...drivers, { ...driver("NEO", "Neo"), hasAccount: false },
      { ...driver("AR", "Ar"), hasAccount: false }, driver("UNASSIGNED", "Unassigned"), { ...driver("IN", "Inactive Driver"), active: false }] } };
    const { container } = render(<DriverSettlement />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(screen.getByText("4 drivers")).toBeInTheDocument();
    const options = within(screen.getByRole("combobox")).getAllByRole("option").map(option => option.textContent);
    expect(options).toContain("Inactive Driver (IN)");
    expect(options.join(" ")).not.toMatch(/Neo|Ar \(AR\)|Unassigned/);
    expect(screen.queryByText("NEO")).not.toBeInTheDocument();
    expect(screen.queryByText("AR")).not.toBeInTheDocument();
  });
  it("clears a selected driver if their account is no longer in the roster", () => {
    const { rerender, container } = render(<DriverSettlement />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MA" } });
    mocks.query = { ...mocks.query, data: { drivers: drivers.map(row => row.initials === "MA" ? { ...row, hasAccount: false } : row) } };
    rerender(<DriverSettlement />);
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.queryByText("MA")).not.toBeInTheDocument();
  });
  it("uses an alphabetically sorted dropdown instead of text search", () => {
    render(<DriverSettlement />);
    expect(screen.getByRole("heading", { name: "Driver Breakdown" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Select driver" });
    expect(within(filter).getAllByRole("option").map(option => option.textContent)).toEqual(["All drivers", "Alex (AB)", "Alex (MA)", "Zara (ZZ)"]);
  });
  it("selects the exact driver and restores all rows", () => {
    const { container } = render(<DriverSettlement from="2026-10-01" to="2026-10-10" />);
    const filter = screen.getByRole("combobox", { name: "Select driver" });
    fireEvent.change(filter, { target: { value: "MA" } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText("1 driver")).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "" } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });
  it("resets a selection no longer available in the changed date range", () => {
    const { rerender, container } = render(<DriverSettlement />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MA" } });
    mocks.query = { ...mocks.query, data: { drivers: [drivers[0]] } };
    rerender(<DriverSettlement from="2026-10-10" />);
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });
  it("shows calculated Total Charges rather than the adjusted billed total", () => {
    mocks.query = { ...mocks.query, data: { drivers: [{ ...driver("MA", "Man Van"),
      calculatedChargesPounds: 653.2, totalChargesPounds: 376.6, revenuePounds: 376.6, totalCollectionsPounds: 506.6 }] } };
    const { container } = render(<DriverSettlement />);
    expect(screen.getByRole("columnheader", { name: "Total Charges (£)" })).toBeInTheDocument();
    const cells = within(container.querySelector("tbody tr")!).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("653.20");
    expect(cells[3]).toHaveTextContent("376.60");
    expect(cells[4]).toHaveTextContent("1 / 0"); expect(cells[5]).toHaveTextContent("1.0h"); expect(cells[6]).toHaveTextContent("1.5h");
    expect(screen.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Driver", "Jobs", "Total Charges (£)", "Driver Collected (£)", "RW Sent / Not Sent", "Working Hours", "Overtime Hours", "Report"]);
  });
  it("shows review counts instead of moving hours, highlighting not-sent reviews", () => {
    mocks.query = { ...mocks.query, data: { drivers: [{ ...driver("WD", "Driver WD"), completed: 3, reviewSentCount: 1, reviewNotSentCount: 2 }] } };
    const { container } = render(<DriverSettlement />);
    const reviews = within(container.querySelector("tbody tr")!).getAllByRole("cell")[4];
    expect(reviews).toHaveTextContent("1 / 2");
    expect(within(reviews).getByText("2")).toHaveClass("text-red-700");
    expect(screen.queryByRole("columnheader", { name: "Moving Hours" })).not.toBeInTheDocument();
  });
  it("shows known working hours and flags missing timings without inventing zero hours", () => {
    mocks.query = { ...mocks.query, data: { drivers: [{ ...driver("WD", "Driver WD"), completed: 3, totalDurationMinutes: 90, workingUnknownJobs: 2 }] } };
    const { container, rerender } = render(<DriverSettlement />);
    const hours = () => within(container.querySelector("tbody tr")!).getAllByRole("cell")[5];
    expect(hours()).toHaveTextContent("1.5h");
    expect(within(hours()).getByText("2 unavailable")).toHaveClass("text-red-700");
    mocks.query = { ...mocks.query, data: { drivers: [{ ...driver("WD", "Driver WD"), completed: 3, totalDurationMinutes: 0, workingUnknownJobs: 3 }] } };
    rerender(<DriverSettlement />);
    expect(hours()).toHaveTextContent("Unavailable");
    expect(hours()).not.toHaveTextContent("0.0h");
  });
});
