import React from "react";
import { render, screen } from "@testing-library/react";
import { DateTime } from "luxon";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedJob } from "../../types";
import { LiveOperations } from "./LiveOperations";

const job = (over: Partial<NormalizedJob>) => ({ jobId: "TMV-1", status: "READY", bookedStart: DateTime.now().plus({ hours: 2 }).toISO(), driverInitials: "SD", driverName: "Sam Driver", customerName: "Alex Sample", ...over }) as NormalizedJob;
const bar = (label: string) => screen.getByText(label).closest("div")!.querySelector("[data-accent]")!.getAttribute("data-accent");
const renderOps = (jobs: NormalizedJob[]) => render(<LiveOperations jobs={jobs} loading={false} onRetry={vi.fn()} truncated={false} updatedAt={Date.now()} onOpenJobs={vi.fn()} />);

describe("LiveOperations counters", () => {
  it("keeps the warning bars neutral when there is nothing to act on", () => {
    renderOps([job({})]);
    expect(bar("Awaiting assignment")).toBe("neutral");
    expect(bar("Past start time")).toBe("neutral");
  });

  it("colours the warning bars only while the count is above zero", () => {
    renderOps([
      job({ jobId: "TMV-2", driverInitials: "", driverName: "Unassigned" }),
      job({ jobId: "TMV-3", bookedStart: DateTime.now().minus({ hours: 1 }).toISO()! })
    ]);
    expect(bar("Awaiting assignment")).toBe("signal");
    expect(bar("Past start time")).toBe("signal");
  });
});
