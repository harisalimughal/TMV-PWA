import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { getPreviewServer, resetPreviewServer } from "../../../../lib/booking/preview/instance";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BookingsPage /></QueryClientProvider>);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const nextDate = () => { const d = new Date(Date.now() + 5 * 86400000); return d.toISOString().slice(0, 10); };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("tmv:booking-source", "preview"); window.history.replaceState({}, "", "/admin?section=bookings&view=new"); resetPreviewServer(); });

function fillToReview(price?: { amount: string; reason: string }) {
  type("Customer name", "Ada Test"); type("Phone", "07700 900123"); type("Pickup address", "1 Test Road"); type("Pickup postcode", "SW9 8EJ");
  type("Destination address", "2 Test Street"); type("Destination postcode", "SE10 9NN"); next();
  type("Van type", "Large van"); type("Helpers", "2"); type("Estimated hours", "4"); next();
  type("Moving date (London)", nextDate()); type("Start time (London, 24 hour)", "09:00"); next();
  if (price) { type("Manual price (£), optional", price.amount); type("Reason", price.reason); }
  next();
}

describe("Booking wizard", () => {
  it("blocks each step until its required fields are valid and says what is wrong", () => {
    wrap();
    next();
    expect(screen.getByText("Enter the customer's name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid UK postcode.", { selector: "#w-pp-error" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customer and locations" })).toBeInTheDocument();
  });

  it("saves an enquiry (not a booking) with no price when none is entered, and states the engine is unavailable", async () => {
    wrap();
    const before = getPreviewServer().listBookings({}).pagination.total;
    fillToReview();
    expect(screen.getByRole("heading", { name: "Review and save" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save enquiry" }));
    expect(await screen.findByText("Enquiry saved")).toBeInTheDocument();
    expect(screen.getByText(/It is an enquiry, not a confirmed booking\. It has no price yet\./)).toBeInTheDocument();
    expect(getPreviewServer().listBookings({}).pagination.total).toBe(before);
    const created = getPreviewServer().listEnquiries({ q: "Ada Test" }).items[0];
    expect(created.quotation!.versions).toHaveLength(0);
    expect(sessionStorage.getItem("tmv:booking-draft")).toBeNull();
  });

  it("never creates two enquiries from a double click", async () => {
    wrap();
    fillToReview();
    const save = screen.getByRole("button", { name: "Save enquiry" });
    fireEvent.click(save); fireEvent.click(save);
    await screen.findByText("Enquiry saved");
    expect(getPreviewServer().listEnquiries({ q: "Ada Test" }).items).toHaveLength(1);
  });

  it("requires a reason for a manual price and records it as manual", async () => {
    wrap();
    type("Customer name", "Ada Test"); type("Phone", "07700 900123"); type("Pickup address", "1 Test Road"); type("Pickup postcode", "SW9 8EJ");
    type("Destination address", "2 Test Street"); type("Destination postcode", "SE10 9NN"); next();
    type("Van type", "Large van"); type("Helpers", "2"); type("Estimated hours", "4"); next();
    type("Moving date (London)", nextDate()); type("Start time (London, 24 hour)", "09:00"); next();
    expect(screen.getByText(/pricing engine is not connected/i)).toBeInTheDocument();
    type("Manual price (£), optional", "310"); next();
    expect(screen.getByText("A reason is required when you enter a price yourself.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Agreed by phone with customer" } }); next();
    fireEvent.click(screen.getByRole("button", { name: "Save enquiry" }));
    expect(await screen.findByText(/Price recorded: £310\.00 \(manual\)/)).toBeInTheDocument();
    const q = getPreviewServer().listEnquiries({ q: "Ada Test" }).items[0].quotation!;
    expect(q.versions[0]).toMatchObject({ source: "manual", totalPence: 31000, reason: "Agreed by phone with customer" });
  });

  it("autosaves the draft and restores it", async () => {
    vi.useFakeTimers();
    const first = wrap();
    type("Customer name", "Half Done");
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(JSON.parse(sessionStorage.getItem("tmv:booking-draft")!).draft.customerName).toBe("Half Done");
    first.unmount(); vi.useRealTimers();
    wrap();
    expect(screen.getByLabelText("Customer name")).toHaveValue("Half Done");
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByLabelText("Customer name")).toHaveValue("");
  });
});
