import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddJobModal, validateBooking } from "./AddJobModal";

const api = vi.hoisted(() => ({ addJob: vi.fn(), fetchDrivers: vi.fn() }));
vi.mock("../api", () => ({ addJob: api.addJob }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: api.fetchDrivers }));
const draft = { customerName: "Example", customerEmail: "", customerPhone: "", pickup: "1 Example Road", dropoff: "2 Sample Road", crewSize: "2", price: "120", paidOnline: true, start: "2026-10-15T10:00", finish: "2026-10-15T12:00", driverId: "" };
const close = vi.fn();
function show() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AddJobModal isOpen onClose={close} /></QueryClientProvider>); }
function fill() {
  for (const [label, value] of [["Customer name", draft.customerName], ["Pickup address", draft.pickup], ["Drop-off address", draft.dropoff], ["Booking price", draft.price], ["Start", draft.start], ["Finish", draft.finish]]) fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}
beforeEach(() => { vi.clearAllMocks(); api.fetchDrivers.mockResolvedValue([]); api.addJob.mockResolvedValue(undefined); });
describe("booking integration", () => {
  it("closes after successful creation and invalidates the dashboard range", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["range_jobs", "today"], { jobs: [] });
    render(<QueryClientProvider client={client}><AddJobModal isOpen onClose={close} /></QueryClientProvider>); fill();
    fireEvent.submit(document.getElementById("create-booking")!);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(client.getQueryState(["range_jobs", "today"])?.isInvalidated).toBe(true);
  });
  it.each([{ price: "-1" }, { price: "NaN" }, { crewSize: "1.5" }, { finish: draft.start }, { customerName: " " }, { customerEmail: "invalid" }])("rejects invalid inputs %j", patch => {
    expect(validateBooking({ ...draft, ...patch })).not.toBeNull();
  });
  it("preserves the established payload and suppresses concurrent submissions", async () => {
    api.addJob.mockImplementation(() => new Promise(() => {})); show(); fill();
    const form = screen.getByRole("button", { name: "Create job" }).closest('[role="dialog"]')!.querySelector("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(api.addJob).toHaveBeenCalledOnce();
    expect(api.addJob).toHaveBeenCalledWith(expect.objectContaining({ customerName: draft.customerName, price: 120, crewSize: 2, paidOnline: true, start: draft.start, finish: draft.finish }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
  it("keeps the draft on server failure and offers safe retry guidance", async () => {
    api.addJob.mockRejectedValue(new Error("Connection lost")); show(); fill();
    fireEvent.submit(document.getElementById("create-booking")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("check Jobs before retrying");
    expect(screen.getByLabelText(/Customer name/)).toHaveValue(draft.customerName);
    expect(close).not.toHaveBeenCalled();
  });
  it("requires confirmation to discard edits", async () => {
    show(); await waitFor(() => expect(api.fetchDrivers).toHaveBeenCalled()); fill();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard this booking?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText(/Customer name/)).toHaveValue(draft.customerName);
  });
});
