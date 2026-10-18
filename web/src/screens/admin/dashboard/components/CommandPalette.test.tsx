import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { clearSearchHistory } from "../search/history";

const api = vi.hoisted(() => ({ fetchJobs: vi.fn(), fetchScenarios: vi.fn(), fetchVanDriverRecords: vi.fn() }));
const roster = vi.hoisted(() => ({ fetchDrivers: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), ...api }));
vi.mock("../../../../api/admin", async original => ({ ...await original<typeof import("../../../../api/admin")>(), fetchDrivers: roster.fetchDrivers }));
vi.mock("../hooks/useAttention", async original => ({ ...await original<typeof import("../hooks/useAttention")>(), useAttention: () => ({ items: [] }) }));

const person = (initials: string, fullName: string, vanRegistration = "") => ({ initials, fullName, vanRegistration, active: true, email: "", phone: "", role: "driver", hasPassword: true, lastLoginAt: null });

const renderPalette = (onClose = vi.fn()) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CommandPalette isOpen onClose={onClose} /></QueryClientProvider>);
  return { onClose, input: screen.getByRole("combobox") };
};
const labels = () => screen.queryAllByRole("option").map(option => option.querySelector("span.min-w-0 > span")?.textContent);
const type = async (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  clearSearchHistory();
  roster.fetchDrivers.mockReset().mockResolvedValue([person("KA", "Caio", "AB12CDE"), person("TI", "Tiago", "CD34EFG"), person("HE", "Henrique")]);
  api.fetchJobs.mockReset().mockResolvedValue({ items: [{ jobId: "TMV-489FDAB633", customerName: "Alex Sample", pickup: "1 Example Street", dropoff: "2 Sample Road", bookedStart: "2026-10-13T09:00:00Z", status: "READY", driverName: "Tiago", driverInitials: "TI" }], pagination: { page: 1, pageSize: 20, total: 1 } });
  api.fetchScenarios.mockReset().mockResolvedValue({ kind: "parking", items: [], pagination: { page: 1, pageSize: 25, total: 0 } });
  api.fetchVanDriverRecords.mockReset().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 25, total: 0 } });
  window.history.replaceState({}, "", "/admin?section=overview");
});
afterEach(() => vi.useRealTimers());

describe("CommandPalette", () => {
  it("opens on quick actions, with an example of what can be searched", () => {
    renderPalette();
    expect(labels()).toEqual(expect.arrayContaining(["Generate report", "Jobs", "Drivers", "Parking Liability"]));
    expect(screen.getByText(/for example “TI”/)).toBeInTheDocument();
  });

  it("shows focus on the whole search row, not a clipped ring around the input", () => {
    const { input } = renderPalette();
    expect(input).toHaveClass("focus-visible:outline-none");
    expect(input.parentElement).toHaveClass("focus-within:border-admin-brand");
  });

  it("finds a driver from one letter, without a server request", async () => {
    const { input } = renderPalette();
    await screen.findByText("Generate report");
    await act(async () => { await Promise.resolve(); });
    await type(input, "T");
    expect(await screen.findByRole("option", { name: /Tiago/ })).toBeInTheDocument();
    expect(api.fetchJobs).not.toHaveBeenCalled();
  });

  it("KA opens Caio's report (stored initials) with Enter", async () => {
    const { input, onClose } = renderPalette();
    await type(input, "KA");
    await screen.findByRole("option", { name: /Caio/ });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    expect(window.location.search).toMatch(/section=driverreport&driver=KA/);
  });

  it("searches jobs on the server with a cancellable request and opens the exact job", async () => {
    const { input } = renderPalette();
    await type(input, "489F");
    const option = await screen.findByRole("option", { name: /TMV-489FDAB633/ });
    expect(api.fetchJobs).toHaveBeenCalledWith(expect.objectContaining({ q: "489f", pageSize: 20 }), expect.any(AbortSignal));
    fireEvent.click(option);
    expect(new URLSearchParams(window.location.search).get("job")).toBe("TMV-489FDAB633");
  });

  it("highlights the matched text as plain text", async () => {
    const { input } = renderPalette();
    await type(input, "tiago");
    const option = await screen.findByRole("option", { name: /^Tiago/ });
    expect(within(option).getAllByText("Tiago")[0].tagName).toBe("MARK");
  });

  it("debounces: one request for a burst of typing, for the last query only", async () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "al" } });
    fireEvent.change(input, { target: { value: "ale" } });
    await type(input, "alex");
    await screen.findByRole("option", { name: /TMV-489FDAB633/ });
    expect(api.fetchJobs.mock.calls.map(call => call[0].q)).toEqual(["alex"]);
  });

  it("reports a failed source instead of 'no results'", async () => {
    api.fetchJobs.mockRejectedValue(new Error("Server error"));
    const { input } = renderPalette();
    await type(input, "zzzz");
    expect(await screen.findByRole("alert")).toHaveTextContent("Jobs could not be searched right now");
    expect(screen.getByText(/No matches in the sources that answered/)).toBeInTheDocument();
  });

  it("offers related destinations when nothing matches, labelled as such", async () => {
    api.fetchJobs.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0 } });
    const { input } = renderPalette();
    await type(input, "qqqq");
    expect(await screen.findByText("No matches for “qqqq”")).toBeInTheDocument();
    expect(screen.getByText("Try one of these instead")).toBeInTheDocument();
  });

  it("scope chips limit results to one type", async () => {
    const { input } = renderPalette();
    await type(input, "tiago");
    await screen.findByRole("option", { name: /TMV-489FDAB633/ });
    fireEvent.click(screen.getByRole("button", { name: "Drivers" }));
    expect(labels()).not.toContain("TMV-489FDAB633 · Alex Sample");
    expect(screen.getByRole("button", { name: "Drivers" })).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers what was opened and lets the user clear it", async () => {
    const { input } = renderPalette();
    await type(input, "tiago");
    fireEvent.click(await screen.findByRole("option", { name: /^Tiago/ }));
    cleanup();
    renderPalette();
    expect(screen.getAllByText("Recently opened").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Clear history" }).at(-1)!);
    expect(screen.queryByText("Recently opened")).not.toBeInTheDocument();
  });

  it("supports arrow keys and Enter", async () => {
    const { input } = renderPalette();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.search).toBe("?section=jobs");
  });
});
