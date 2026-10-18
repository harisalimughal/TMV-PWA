import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddDriverModal, type DriverEditTarget } from "./AddDriverModal";

const api = vi.hoisted(() => ({ fetchDrivers: vi.fn(), fetchLiveFleet: vi.fn(), saveDriver: vi.fn() }));
vi.mock("../api", () => api);

const target: DriverEditTarget = { initials: "SD", fullName: "Sam Driver", email: "sam@example.invalid", phone: "07000 000111", vanRegistration: "AB12CDE", imei: "111", active: true };

function setup(driver: DriverEditTarget | null = target) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><AddDriverModal isOpen onClose={onClose} driverToEdit={driver} /></QueryClientProvider>);
  return { onClose, invalidate };
}

beforeEach(() => {
  api.fetchDrivers.mockReset().mockResolvedValue({ drivers: [{ initials: "SD", hasAccount: true, imei: "111" }, { initials: "OL", hasAccount: true }] });
  api.fetchLiveFleet.mockReset().mockResolvedValue({ vehicles: [{ imei: "111", plateNumber: "AB12CDE", name: "Van 1" }] });
  api.saveDriver.mockReset().mockResolvedValue({});
});

describe("AddDriverModal (edit)", () => {
  it("opens prefilled with the stored values and keeps the initials", async () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Edit Sam Driver" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Sam Driver");
    expect(screen.getByLabelText(/Driver code/)).toHaveValue("SD");
    expect(screen.getByLabelText(/Sign-in email/)).toHaveValue("sam@example.invalid");
    expect(screen.getByLabelText("Phone")).toHaveValue("07000 000111");
    expect(screen.getByLabelText("Vehicle registration")).toHaveValue("AB12CDE");
    expect(screen.getByLabelText(/Account active/)).toBeChecked();
  });

  it("does not regenerate the initials when the name changes", () => {
    setup();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Zed Quinn" } });
    expect(screen.getByLabelText(/Driver code/)).toHaveValue("SD");
  });

  it("shows validation errors and does not save an invalid form", async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Sign-in email/), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the driver's full name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(api.saveDriver).not.toHaveBeenCalled();
  });

  it("saves the stored identity and assignment, refreshes the lists and closes", async () => {
    const { onClose, invalidate } = setup();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "07000 999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.saveDriver).toHaveBeenCalledWith({ initials: "SD", fullName: "Sam Driver", email: "sam@example.invalid", active: true, phone: "07000 999999", vanRegistration: "AB12CDE", imei: "111" });
    const keys = invalidate.mock.calls.map(call => JSON.stringify((call[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(["drivers_summary"]));
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("sends a password only when one is typed", async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/New app password/), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveDriver).toHaveBeenCalled());
    expect(api.saveDriver.mock.calls[0][0]).toMatchObject({ initials: "SD", password: "longenough1" });
  });

  it("keeps what was typed and shows the error when the save fails", async () => {
    api.saveDriver.mockRejectedValue(new Error("Not allowed"));
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "07111" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Not allowed")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveValue("07111");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without saving", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.saveDriver).not.toHaveBeenCalled();
  });
});
