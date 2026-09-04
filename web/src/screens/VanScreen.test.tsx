import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { VanScreen } from "./VanScreen";

describe("VanScreen", () => {
  it("renders fuel, service and compliance cards for the assigned van", () => {
    render(
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
    expect(screen.getByText("Road tax renewal")).toBeInTheDocument();
    expect(screen.getByText("MOT expiry")).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: /take photo/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /upload/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /submit fuel entry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit service record/i })).toBeInTheDocument();
  });
});
