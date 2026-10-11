import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverSettlement } from "./DriverSettlement";
import type { DriverSummaryItem } from "../types";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../api", () => ({ fetchDrivers: mocks.fetch }));
const driver = { initials: "WD", fullName: "Driver WD", hasAccount: true, completed: 3, calculatedChargesPounds: 200,
  totalChargesPounds: 200, revenuePounds: 180, totalDurationMinutes: 150, workingUnknownJobs: 0, overtimeMinutes: 30, reviewSentCount: 1, reviewNotSentCount: 2 } as DriverSummaryItem;
const renderTable = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <DriverSettlement from="2026-10-10" to="2026-10-11" />
</QueryClientProvider>);

beforeEach(() => mocks.fetch.mockReset());
describe("Breakdown table without GPS reads", () => {
  it("shows finance and review counts with a single non-GPS request", async () => {
    mocks.fetch.mockImplementation((_from, _to, moving) => {
      if (moving) throw new Error("The summary table must not load GPS");
      return Promise.resolve({ drivers: [driver] });
    });
    renderTable();
    expect(await screen.findByText("Driver WD")).toBeInTheDocument();
    expect(screen.getByText("200.00")).toBeInTheDocument();
    expect(screen.getByText("180.00")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "RW Sent / Not Sent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Working Hours" })).toBeInTheDocument();
    expect(screen.getByText("2.5h")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open report for Driver WD" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).not.toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][2]).toBe(false);
    expect(mocks.fetch.mock.calls[0][4]).toBe(true);
  });
  it("does not request GPS when no finished jobs match", async () => {
    mocks.fetch.mockResolvedValue({ drivers: [{ ...driver, completed: 0 }] });
    renderTable();
    expect(await screen.findByText("No finished job data")).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][2]).toBe(false);
  });
});
