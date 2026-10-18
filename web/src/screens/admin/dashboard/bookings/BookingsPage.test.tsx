import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { resetPreviewServer } from "../../../../lib/booking/preview/instance";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BookingsPage /></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/admin?section=bookings"); resetPreviewServer(); });
afterEach(() => vi.unstubAllGlobals());

describe("Bookings module", () => {
  it("says plainly that bookings are unavailable when the server has no endpoints, and offers sample data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not implemented" }), { status: 501 })));
    wrap();
    expect(await screen.findByText("Bookings are not available on this server yet")).toBeInTheDocument();
    expect(screen.queryByText(/£0\.00/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explore with sample data" }));
    expect(await screen.findByText("Sample data")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Needs your attention" })).toBeInTheDocument();
  });

  it("shows the command centre from sample data with labelled figures, attention items and no silent zeros", async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    wrap();
    expect(await screen.findByRole("heading", { name: "Needs your attention" })).toBeInTheDocument();
    for (const label of ["New enquiries", "Confirmed bookings", "Today's jobs", "Unassigned bookings", "Driver utilisation"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    // Driver shift data is unknown for some drivers, so utilisation must be unavailable rather than a number.
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    const upcoming = await screen.findByRole("table", { name: "Upcoming bookings" });
    expect(within(upcoming).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("keeps the active view in the URL and marks it as current", async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Calendar" }));
    expect(window.location.search).toContain("view=calendar");
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("group", { name: "Calendar view" })).toBeInTheDocument();
  });
});
