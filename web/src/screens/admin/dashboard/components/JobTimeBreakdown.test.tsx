import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../types";
import { JobTimeBreakdown } from "./JobTimeBreakdown";

const billing = { ruleVersion: "v1", scheduledMinutes: 120, allocatedMinutes: 120, actualMinutes: 150, extraMinutes: 30, billedExtraBlocks: 1, billedExtraMinutes: 30,
  ratePer30Pence: 5500, rateSource: "settings" as const, extraChargePence: 5500 };

describe("Job time breakdown", () => {
  it("separates booking text, Calendar event length and billing input instead of calling a value 'original'", () => {
    render(<JobTimeBreakdown job={{
      bookedStart: "2026-10-13T08:00:00Z", bookedFinish: "2026-10-13T09:30:00Z", bookingDetails: { hireDuration: "1h 30m" },
      overtimeCharge: 5500, timeBilling: billing
    } as NormalizedJob} />);
    expect(screen.queryByText(/original/i)).not.toBeInTheDocument();
    expect(screen.getByText("Booking text duration")).toBeInTheDocument();
    expect(screen.getAllByText("1h 30m")).toHaveLength(2);
    expect(screen.getByText("Calendar event length")).toBeInTheDocument();
    expect(screen.getByText("Scheduled minutes used for billing")).toBeInTheDocument();
    expect(screen.getByText("Billing input; differs from the Calendar event length")).toBeInTheDocument();
    expect(screen.getAllByText("2h 0m")).toHaveLength(2);
    expect(screen.getByText("2h 30m")).toBeInTheDocument();
    expect(screen.getByText("Overtime rate from Pricing settings")).toBeInTheDocument();
  });

  it("uses one Calendar row when the billing input equals the event length", () => {
    render(<JobTimeBreakdown job={{ bookedStart: "2026-10-13T08:00:00Z", bookedFinish: "2026-10-13T10:00:00Z", overtimeCharge: 0, timeBilling: billing } as NormalizedJob} />);
    expect(screen.getAllByText("Calendar event length")).toHaveLength(1);
    expect(screen.queryByText("Scheduled minutes used for billing")).not.toBeInTheDocument();
  });

  it("preserves unknown rate and charge values", () => {
    render(<JobTimeBreakdown job={{ bookedStart: "", bookedFinish: "", timeBilling: { ...billing, ratePer30Pence: null, rateSource: "unavailable", extraChargePence: null } } as unknown as NormalizedJob} />);
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });

  it("labels historical charges without inventing an allocation", () => {
    render(<JobTimeBreakdown job={{ bookedMinutes: 90, overtimeCharge: 0, status: "COMPLETED", bookedStart: "", bookedFinish: "" } as unknown as NormalizedJob} />);
    expect(screen.getByText("Historical billing: the charges saved on this job are kept as recorded.")).toBeInTheDocument();
    expect(screen.queryByText("Allowance before extra time")).not.toBeInTheDocument();
  });

  it("labels missing or invalid durations without guessing zero minutes", () => {
    render(<JobTimeBreakdown job={{ bookedMinutes: null, actualMinutes: NaN, overtimeCharge: 0, driverReportedOvertimeMinutes: -1, bookedStart: "", bookedFinish: "" } as unknown as NormalizedJob} />);
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
    expect(screen.queryByText("0 min")).not.toBeInTheDocument();
    expect(screen.queryByText("Driver-reported extra time")).not.toBeInTheDocument();
  });
});
