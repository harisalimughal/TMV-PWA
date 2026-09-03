import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { VanScreen } from "./VanScreen";

describe("VanScreen", () => {
  it("renders the mileage upload form", () => {
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
    expect(screen.getByLabelText("Mileage reading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take photo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload mileage photo/i })).toBeInTheDocument();
  });
});
