import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RawBookingText } from "./RawBookingText";

describe("RawBookingText", () => {
  it("shows copy buttons for booking contact and address fields without changing the raw text", () => {
    render(
      <RawBookingText
        text={[
          "Customer name: Jane Driver",
          "Email: jane@example.com",
          "Phone: 07123456789",
          "Move from: 1 Pickup Street",
          "Notes: keep this raw"
        ].join("\n")}
      />
    );

    expect(screen.getByText("Customer name:")).toBeInTheDocument();
    expect(screen.getByText("Jane Driver")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy Customer name")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy Move from")).toBeInTheDocument();
    expect(screen.queryByLabelText("Copy Notes")).not.toBeInTheDocument();
  });
});
