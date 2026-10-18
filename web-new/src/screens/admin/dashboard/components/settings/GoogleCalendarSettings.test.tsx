import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { handleBookingRoute } from "../../../../../lib/booking/routes";
import { getPreviewServer, resetPreviewServer } from "../../../../../lib/booking/preview/instance";
import { CalendarApiError, eventIdFor } from "../../../../../lib/booking/calendar";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GoogleCalendarSettings /></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); resetPreviewServer(); });
afterEach(() => vi.unstubAllGlobals());

describe("Google Calendar settings", () => {
  it("says plainly that it is unavailable when the server has no endpoints, and changes nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 501 })));
    wrap();
    expect(await screen.findByText("Google Calendar sync is not available on this server yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explore with sample data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect Google account/ })).toBeNull();
  });

  it("connects, chooses a calendar, enables sync, saves, and shows events created", async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    wrap();
    expect(await screen.findByText("Sample data and a simulated connection")).toBeInTheDocument();
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar")).toBeDisabled();
    expect(screen.getByLabelText("Synchronise bookings automatically")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google account" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Calendar")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Calendar"), { target: { value: "sample-ops" } });
    fireEvent.click(screen.getByLabelText("Synchronise bookings automatically"));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    await waitFor(() => expect(getPreviewServer().calendar.fake.events.size).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText("In sync").nextSibling!.textContent).not.toBe("0"), { timeout: 4000 });
  });

  it("starts with the private defaults: no phone, email, inventory or notes, postcodes only, mark as cancelled", async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    wrap();
    await screen.findByText("Not connected");
    fireEvent.click(screen.getByRole("button", { name: "Connect Google account" }));
    await screen.findByText("Connected");
    for (const name of ["Customer phone", "Customer email", "Inventory", "Notes"]) expect(screen.getByLabelText(name)).not.toBeChecked();
    expect(screen.getByLabelText("Customer name")).toBeChecked();
    expect(screen.getByLabelText("Addresses")).toHaveValue("postcode");
    expect(screen.getByRole("radio", { name: /Private \(recommended\)/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Mark the event as cancelled/ })).toBeChecked();
    expect(screen.getByLabelText("Synchronise bookings automatically")).toBeDisabled();
  });

  it("lists a failed operation and retries it", { timeout: 10000 }, async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    const server = getPreviewServer();
    server.calendar.connect();
    server.calendar.updateConfig({ calendarId: "sample-ops" });
    server.calendar.fake.failNext(new CalendarApiError(400, "invalid"));
    server.calendar.updateConfig({ enabled: true });
    await server.calendar.flush();
    wrap();
    const retry = await screen.findByRole("button", { name: /^Retry TMV-/ });
    expect(screen.getAllByText(/Google refused the change/).length).toBeGreaterThan(0);
    const reference = retry.getAttribute("aria-label")!.replace("Retry ", "");
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: `Retry ${reference}` })).toBeNull(), { timeout: 8000 });
    const id = server.listBookings({ pageSize: 100 }).items.find(b => b.reference === reference)!.id;
    expect(server.calendar.fake.events.has(eventIdFor(id))).toBe(true);
  });

  it("tells you to reconnect when Google rejects the sign-in, and says changes are not lost", async () => {
    localStorage.setItem("tmv:booking-source", "preview");
    const server = getPreviewServer();
    server.calendar.connect(); server.calendar.updateConfig({ calendarId: "sample-ops", enabled: true }); await server.calendar.flush();
    server.calendar.expireSignIn();
    wrap();
    expect(await screen.findByText("Google rejected the saved sign-in")).toBeInTheDocument();
    expect(screen.getByText("Needs reconnecting")).toBeInTheDocument();
    expect(within(screen.getByText("Google rejected the saved sign-in").closest("div")!).getByText(/nothing is lost/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect Google account" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("labels the connection as simulated whenever the server says so, even without choosing sample data", async () => {
    // The dev and demo mock answers the live endpoints; the screen must not look like a real connection.
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, "http://localhost");
      const r = handleBookingRoute(getPreviewServer(), init?.method ?? "GET", u.pathname, u.search.slice(1), init?.body as string | undefined);
      return new Response(JSON.stringify(r?.body ?? {}), { status: r?.status ?? 501 });
    }));
    wrap(); // no tmv:booking-source set: the live source
    expect(await screen.findByText("Sample data and a simulated connection")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use live data" })).toBeNull();
  });
});
