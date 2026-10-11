import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../types";
import { JobTimeBreakdown } from "./JobTimeBreakdown";

describe("Job time breakdown", () => {
  it("shows original, allocated and actual durations with billed blocks and source", () => {
    render(<JobTimeBreakdown job={{
      bookedMinutes: 90, overtimeCharge: 5500, driverReportedOvertimeMinutes: 0,
      timeBilling: { ruleVersion: "v1", scheduledMinutes: 90, allocatedMinutes: 120,
        actualMinutes: 150, extraMinutes: 30, billedExtraBlocks: 1, billedExtraMinutes: 30,
        ratePer30Pence: 5500, rateSource: "settings", extraChargePence: 5500 }
    } as NormalizedJob} />);
    expect(screen.getByText("90 min")).toBeInTheDocument();
    expect(screen.getByText("120 min")).toBeInTheDocument();
    expect(screen.getByText("150 min")).toBeInTheDocument();
    expect(screen.getByText("Pricing Settings: overtime")).toBeInTheDocument();
    expect(screen.getByText("0 min")).toBeInTheDocument();
    expect(screen.getAllByText("GBP 55.00")).toHaveLength(2);
  });

  it("preserves unknown rate and charge values", () => {
    render(<JobTimeBreakdown job={{
      timeBilling: { ruleVersion: "v1", scheduledMinutes: 90, allocatedMinutes: 120,
        actualMinutes: 150, extraMinutes: 30, billedExtraBlocks: 1, billedExtraMinutes: 30,
        ratePer30Pence: null, rateSource: "unavailable", extraChargePence: null }
    } as NormalizedJob} />);
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });

  it("labels historical charges without inventing an allocation snapshot", () => {
    render(<JobTimeBreakdown job={{ bookedMinutes: 90, overtimeCharge: 0, status: "COMPLETED" } as NormalizedJob} />);
    expect(screen.getByText("Historical billing: saved charges retained.")).toBeInTheDocument();
    expect(screen.queryByText("Internal allocation")).not.toBeInTheDocument();
  });
});
