import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { pricingProblem, shownPrice } from "./EnquiryInbox";
import { getPreviewServer, resetPreviewServer } from "../../../../lib/booking/preview/instance";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BookingsPage /></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); localStorage.setItem("tmv:booking-source", "preview"); window.history.replaceState({}, "", "/admin?section=bookings&view=enquiries"); resetPreviewServer(); });

const open = async (reference: string) => {
  const list = await screen.findByRole("list");
  fireEvent.click(await within(list).findByRole("button", { name: new RegExp(reference) }));
  return screen.findByRole("region", { name: "History" });
};

describe("price display", () => {
  it("never produces a price for an enquiry without a recorded one", () => {
    expect(shownPrice({ quotation: null })).toBeNull();
    expect(shownPrice({ quotation: { versions: [{ id: "v", totalPence: null } as never], approvedVersionId: null } as never })).toBeNull();
    expect(pricingProblem({ quotation: null })).toMatch(/No quotation/);
  });
});

describe("Enquiry inbox", () => {
  it("lists categories with counts and shows an unpriced enquiry as such, never £0.00", async () => {
    wrap();
    expect(await screen.findByRole("navigation", { name: "Enquiry categories" })).toBeInTheDocument();
    await screen.findByRole("list");
    expect(screen.queryByText(/£0\.00/)).toBeNull();
    expect(screen.getAllByText(/Pricing unavailable|Pricing pending|Manual review|Pricing failed/).length).toBeGreaterThan(0);
  });

  it("filters by search and says so when nothing matches", async () => {
    wrap();
    await screen.findByRole("list");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search enquiries" }), { target: { value: "zzzz-no-such" } });
    expect(await screen.findByText("No enquiries match these filters")).toBeInTheDocument();
  });

  it("flags a possible duplicate without merging anything", async () => {
    wrap();
    const dup = getPreviewServer().listEnquiries({ pageSize: 50 }).items.find(e => e.duplicateOf)!;
    await open(dup.reference);
    expect(await screen.findByText(new RegExp(`Possible duplicate of ${dup.duplicateOf}`))).toBeInTheDocument();
    expect(getPreviewServer().getEnquiry(dup.id).status).toBe(dup.status);
  });

  it("requires a reason for a manual price and records it as a manual price", async () => {
    wrap();
    const target = getPreviewServer().listEnquiries({ pageSize: 50 }).items.find(e => e.allowedActions.includes("calculate_quote") && e.status === "new")!;
    await open(target.reference);
    fireEvent.click(await screen.findByRole("button", { name: "Record manual price" }));
    const save = screen.getByRole("button", { name: "Save manual price" });
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "310" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Phoned the customer, agreed price" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByText("Manual price recorded.")).toBeInTheDocument();
    const after = getPreviewServer().getEnquiry(target.id);
    expect(shownPrice(after)).toEqual({ pence: 31000, source: "Manual price" });
    expect(after.quotation!.versions.at(-1)!.reason).toMatch(/agreed price/);
  });

  it("offers only the actions the state allows", async () => {
    wrap();
    const closed = getPreviewServer().listEnquiries({ category: "closed", pageSize: 5 }).items[0];
    if (closed) {
      await open(closed.reference);
      await screen.findByRole("heading", { name: "Pricing" });
      expect(screen.queryByRole("button", { name: "Close enquiry" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Confirm as booking" })).toBeNull();
    }
  });
});
