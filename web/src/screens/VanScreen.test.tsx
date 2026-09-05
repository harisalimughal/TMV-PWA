import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { VanScreen } from "./VanScreen";

describe("VanScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders fuel, service and compliance cards for the assigned van", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ compliance: null })
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <VanScreen
            driver={{
              email: "driver@example.com",
              fullName: "Test Driver",
              initials: "TD",
              vanRegistration: "AB12 CDE"
            }}
          />
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: "Vehicle Details" })).toBeInTheDocument();
    expect(screen.getAllByText("AB12 CDE")).toHaveLength(2);

    expect(screen.getByRole("heading", { name: "Add Fuel Entry" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Odometer reading/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total cost/)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Record Service" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Service mileage/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Service type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Service date/)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Vehicle Compliance" })).toBeInTheDocument();
    expect(screen.getByText("Next road tax renewal")).toBeInTheDocument();
    expect(screen.getByText("Next MOT date")).toBeInTheDocument();
    expect(screen.queryByText("Insurance renewal")).not.toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: /take photo/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /upload/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /submit fuel entry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit service record/i })).toBeInTheDocument();
  });

  it("shows exact circular compliance status and warns inside 30 days", async () => {
    const roadTaxDate = dateFromToday(23);
    const motDate = dateFromToday(71);
    const insuranceDate = dateFromToday(15);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        compliance: {
          vanRegistration: "AB12 CDE",
          roadTaxRenewalDate: roadTaxDate.raw,
          motExpiryDate: motDate.raw,
          insuranceExpiryDate: insuranceDate.raw
        }
      })
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <VanScreen
            driver={{
              email: "driver@example.com",
              fullName: "Test Driver",
              initials: "TD",
              vanRegistration: "AB12 CDE"
            }}
          />
        </ToastProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText(roadTaxDate.formatted)).toBeInTheDocument());

    expect(screen.getByLabelText(`Road tax: ${roadTaxDate.formatted}, due in 23 days`)).toBeInTheDocument();
    expect(screen.getByLabelText(`MOT: ${motDate.formatted}, Status: OK`)).toBeInTheDocument();
    expect(screen.queryByText("Insurance renewal")).not.toBeInTheDocument();
    expect(screen.queryByText(insuranceDate.formatted)).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Road tax: ${roadTaxDate.formatted}, due in 23 days`).querySelector("[data-compliance-ring]")).toHaveAttribute("data-ring-color", "#ff8a00");
    expect(screen.getByLabelText(`MOT: ${motDate.formatted}, Status: OK`).querySelector("[data-compliance-ring]")).toBeNull();
    expect(screen.getByText("AB12 CDE Next road tax renewal due in 23 days")).toBeInTheDocument();
    expect(screen.getByText(/Alerts show when 30 days or less remain\./)).toBeInTheDocument();
  });
});

function dateFromToday(days: number): { raw: string; formatted: string } {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const raw = date.toISOString().slice(0, 10);
  const formatted = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${raw}T00:00:00Z`))
    .toUpperCase();
  return { raw, formatted };
}
