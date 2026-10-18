import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingPricingStatus } from "./BookingPricingStatus";

describe("Booking pricing status", () => {
  it("states the engine is not connected, lists the gates and shows no prices or price controls", () => {
    render(<BookingPricingStatus />);
    expect(screen.getByText("Pricing engine not connected")).toBeInTheDocument();
    expect(screen.getByText(/parity run against the current Make\.com pricing/)).toBeInTheDocument();
    expect(screen.queryByText(/£/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
