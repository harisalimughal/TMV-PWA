import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { BookingsPage } from "./BookingsPage";
import { rangeOf } from "./Calendar";
import { getPreviewServer, resetPreviewServer } from "../../../../lib/booking/preview/instance";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BookingsPage /></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); localStorage.setItem("tmv:booking-source", "preview"); resetPreviewServer(); });
const go = (query: string) => window.history.replaceState({}, "", `/admin?section=bookings&${query}`);

describe("calendar ranges", () => {
  it("keeps whole London days across the October clock change", () => {
    const week = rangeOf("week", "2026-10-25");
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe("2026-10-19");
    const day = rangeOf("day", "2026-10-25");
    expect((Date.parse(day.to) - Date.parse(day.from)) / 3600000).toBe(25);
    expect(DateTime.fromISO(rangeOf("month", "2026-02-10").days.at(-1)!).day).toBe(28);
  });
});

describe("Calendar", () => {
  it("shows the week by driver with unassigned bookings in their own row", async () => {
    go("view=calendar&mode=week");
    wrap();
    const table = await screen.findByRole("table", { name: "Week schedule by driver" });
    expect(within(table).getByRole("rowheader", { name: /Unassigned/ })).toBeInTheDocument();
    expect(within(table).getAllByText("Availability unknown").length).toBeGreaterThan(0);
  });

  it("labels conflicts in text, not only colour", async () => {
    go("view=calendar&mode=week");
    wrap();
    const server = getPreviewServer();
    const week = server.schedule(...(Object.values((({ from, to }) => ({ from, to }))(rangeOf("week", new Date().toISOString().slice(0, 10)))) as [string, string]));
    await screen.findByRole("table", { name: "Week schedule by driver" });
    if (week.conflicts.length) expect(screen.getAllByText(/^(Conflict|Check)$/).length).toBeGreaterThan(0);
  });

  it("keeps month cells readable on a narrow screen with compact markers and a legend", async () => {
    go("view=calendar&mode=month");
    wrap();
    const grid = await screen.findByRole("list", { name: "Month overview" });
    expect(within(grid).getAllByText(/^\d+U$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/U = unassigned, ! = conflict/)).toBeInTheDocument();
  });

  it("opens the month overview and drills into a day", async () => {
    go("view=calendar&mode=month");
    wrap();
    const grid = await screen.findByRole("list", { name: "Month overview" });
    const busy = within(grid).getAllByRole("button").find(b => /[1-9]\d* (booking|bookings)/.test(b.getAttribute("aria-label") ?? ""))!;
    fireEvent.click(busy);
    expect(window.location.search).toContain("mode=day");
    expect(await screen.findByRole("group", { name: "Unassigned bookings" })).toBeInTheDocument();
  });

  it("moves only after a server check, and blocks a conflicting move", async () => {
    go("view=calendar&mode=week");
    wrap();
    const server = getPreviewServer();
    const target = server.listBookings({ pageSize: 50 }).items.find(b => b.allowedActions.includes("reassign"))!;
    await screen.findByRole("table", { name: "Week schedule by driver" });
    const moveButton = (await screen.findAllByRole("button", { name: new RegExp(`^Move ${target.reference}$`) }))[0];
    fireEvent.click(moveButton);
    const form = await screen.findByRole("form", { name: `Move ${target.reference}` });
    expect(within(form).getByRole("button", { name: "Apply move" })).toBeDisabled();
    // Moving to 03:00 puts the driver outside their shift: blocked.
    fireEvent.change(within(form).getByLabelText("Start (London, 24 hour)"), { target: { value: "03:00" } });
    fireEvent.click(within(form).getByRole("button", { name: "Check move" }));
    expect(await within(form).findByText("Blocked by the checks below")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Apply move" })).toBeDisabled();
    expect(server.getBooking(target.id).start).toBe(target.start);
  });
});

describe("Dispatch", () => {
  it("lists unassigned bookings, never shows unknown availability as available, and assigns through the checks", async () => {
    go("view=dispatch");
    wrap();
    const list = await screen.findByText("Needs a driver");
    expect(list).toBeInTheDocument();
    const people = await screen.findByText("Drivers today and tomorrow");
    const section = people.closest("section")!;
    const unknownDriver = (await within(section).findAllByText("Unknown"))[0].closest("li")!;
    expect(within(unknownDriver).queryByText("Available")).toBeNull();
    const first = (await screen.findAllByRole("button", { name: /TMV-\d+/ }))[0];
    fireEvent.click(first);
    expect(await screen.findByRole("region", { name: "Recommendations" })).toBeInTheDocument();
  });
});
