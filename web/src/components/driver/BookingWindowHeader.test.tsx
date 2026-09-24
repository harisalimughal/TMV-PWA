import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingWindowHeader } from "./BookingWindowHeader";
import type { Job } from "../../api/jobs";

function job(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "TMV-HEADER",
    calendarEventId: "cal-header",
    driverInitials: "HE",
    customerName: "Suchi S Stark",
    customerEmail: "",
    customerPhone: "",
    pickup: "",
    dropoff: "",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 3,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 535,
    paidOnline: false,
    bookedStart: "2026-09-25T09:00:00+01:00",
    bookedFinish: "2026-09-25T14:00:00+01:00",
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 300,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "Waiting",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 535,
    amountCharged: 0,
    paymentMethod: "",
    paymentStatus: "",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    status: "READY",
    currentState: "READY",
    rawTitle: "3 men 2 vans 535£/Y-HE",
    rawDescription: "",
    createdAt: "2026-09-24T12:00:00.000Z",
    updatedAt: "2026-09-24T12:00:00.000Z",
    ...overrides
  };
}

describe("BookingWindowHeader", () => {
  it("shows the raw Calendar title in the booking chip", () => {
    render(<BookingWindowHeader job={job()} />);

    expect(screen.getByText("3 men 2 vans 535£/Y-HE")).toBeInTheDocument();
  });
});
