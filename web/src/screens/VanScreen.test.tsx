import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { VanScreen } from "./VanScreen";

describe("VanScreen", () => {
  it("renders mileage, fuel and service submission cards, each with a required photo", () => {
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

    expect(screen.getByRole("heading", { name: "Van" })).toBeInTheDocument();

    expect(screen.getByLabelText(/Mileage reading/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Total cost/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Service type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Service date/)).toBeInTheDocument();

    // One PhotoPicker ("Take photo") per card -- all three photos are required.
    expect(screen.getAllByRole("button", { name: /take photo/i })).toHaveLength(3);

    expect(screen.getByRole("button", { name: /submit mileage/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit fuel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit service/i })).toBeInTheDocument();
  });
});
