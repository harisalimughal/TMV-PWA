import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { BookingsPage } from "./BookingsPage";
import { getPreviewServer, resetPreviewServer } from "../../../../lib/booking/preview/instance";

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BookingsPage /></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); localStorage.setItem("tmv:booking-source", "preview"); window.history.replaceState({}, "", "/admin?section=bookings&view=bookings"); resetPreviewServer(); });

describe("All Bookings", () => {
  it("is server paged, sortable with aria-sort, and shows missing prices as such", async () => {
    wrap();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(5);
    expect(screen.queryByText(/£0\.00/)).toBeNull();
    const total = getPreviewServer().listBookings({}).pagination.total;
    expect(await screen.findByText(new RegExp(`${total} bookings`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Customer/ }));
    expect(window.location.search).toContain("sort=customer");
    expect(screen.getByRole("columnheader", { name: /Customer/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: /Customer/ }));
    expect(screen.getByRole("columnheader", { name: /Customer/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("filters on the server and reports an empty result", async () => {
    wrap();
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search bookings" }), { target: { value: "zzzz-none" } });
    expect(await screen.findByText("No bookings match these filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("offers Assign only for bookings the server says can be assigned", async () => {
    wrap();
    await screen.findByRole("table");
    const items = getPreviewServer().listBookings({ pageSize: 15 }).items;
    const assignable = items.filter(b => b.allowedActions.includes("assign")).length;
    expect(screen.queryAllByRole("button", { name: /^Assign a driver to/ })).toHaveLength(assignable);
  });
});

describe("Booking details", () => {
  const openFirst = async (predicate: (b: ReturnType<ReturnType<typeof getPreviewServer>["listBookings"]>["items"][number]) => boolean) => {
    wrap();
    const target = getPreviewServer().listBookings({ pageSize: 50 }).items.find(predicate)!;
    window.history.replaceState({}, "", `/admin?section=bookings&view=bookings&booking=${target.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    const dialog = await screen.findByRole("dialog");
    return { target, dialog };
  };

  it("opens as a dialog with the six tabs and the booking facts", async () => {
    const { target, dialog } = await openFirst(b => b.allowedActions.includes("cancel"));
    expect(within(dialog).getAllByRole("tab").map(t => t.textContent)).toEqual(["Overview", "Moving details", "Pricing", "Assignment", "Activity", "Payments"]);
    expect((await within(dialog).findAllByText(target.customer.name, { exact: false })).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("tab", { name: "Payments" }));
    expect(await within(dialog).findByText(/nothing is assumed/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/£0\.00/)).toBeNull();
  });

  it("shows an unpriced booking as not recorded on the pricing tab", async () => {
    const { dialog } = await openFirst(b => b.payments.agreedPence === null);
    fireEvent.click(within(dialog).getByRole("tab", { name: "Pricing" }));
    expect(await within(dialog).findAllByText(/Not available|No quotation/)).not.toHaveLength(0);
    expect(within(dialog).queryByText(/£0\.00/)).toBeNull();
  });

  it("requires a reason to cancel and records it", async () => {
    const { target, dialog } = await openFirst(b => b.allowedActions.includes("cancel") && !b.assignment);
    fireEvent.click(await within(dialog).findByRole("button", { name: "Cancel booking" }));
    const confirm = within(dialog).getByRole("button", { name: "Confirm cancellation" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason for cancelling (required)"), { target: { value: "Customer called to cancel" } });
    fireEvent.click(confirm);
    await within(dialog).findByText("Booking Cancelled");
    expect(getPreviewServer().getBooking(target.id).status).toBe("cancelled");
  });

  it("assigns a driver from the checked list and refuses a blocked one", async () => {
    const { target, dialog } = await openFirst(b => b.allowedActions.includes("assign"));
    fireEvent.click(within(dialog).getByRole("tab", { name: "Assignment" }));
    const list = await within(dialog).findByRole("region", { name: "Recommendations" });
    expect((await within(list).findAllByRole("listitem")).length).toBeGreaterThan(0);
    const blocked = within(list).queryAllByText("Cannot take it");
    for (const pill of blocked) expect(within(pill.closest("li")!).getByRole("button", { name: /^Assign / })).toBeDisabled();
    const ok = (await within(list).findAllByText("Can take it"))[0].closest("li")!;
    fireEvent.click(within(ok).getByRole("button", { name: /^Assign / }));
    expect(await within(dialog).findByText(/assigned\./)).toBeInTheDocument();
    expect(getPreviewServer().getBooking(target.id).assignment?.status).toBe("confirmed");
  });

  it("uses valid definition-list markup on every tab", async () => {
    const { dialog } = await openFirst(b => b.allowedActions.includes("cancel"));
    for (const name of ["Overview", "Moving details", "Payments"]) {
      fireEvent.click(within(dialog).getByRole("tab", { name }));
      await within(dialog).findByRole("tabpanel");
      for (const dt of dialog.querySelectorAll("dt")) {
        const group = dt.parentElement!;
        expect(["DL", "DIV"], `${name}: dt parent`).toContain(group.tagName);
        if (group.tagName === "DIV") expect(group.parentElement!.tagName, `${name}: dt grandparent`).toBe("DL");
      }
    }
  });
});
