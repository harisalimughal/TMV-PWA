import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobListScreen } from "./JobListScreen";
import type { Job } from "../api/jobs";
import type { DriverProfile } from "../api/auth";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../api/jobs", async original => ({ ...await original<typeof import("../api/jobs")>(), fetchJobsList: mocks.list, markJobViewed: vi.fn().mockResolvedValue({}) }));
vi.mock("../lib/useCountUp", () => ({ useCountUp: (value: number) => value }));
vi.mock("../components/driver/FeaturedJobCard", () => ({ FeaturedJobCard: ({ job }: { job: Job }) => <div>Active {job.jobId}</div> }));
vi.mock("../components/driver/UpcomingJobCard", () => ({ UpcomingJobCard: ({ job, onToggle }: { job: Job; onToggle: () => void }) => <button onClick={onToggle}>Upcoming {job.jobId}</button>, UpcomingJobCardSkeleton: () => <p>Loading</p> }));
const driver = { initials: "MA", fullName: "MA Driver" } as DriverProfile;
const job = (id: string, status = "IN_PROGRESS") => ({ jobId: id, customerName: "Customer", status,
  currentState: "READY", bookedStart: new Date(Date.now() - 7200000).toISOString(), bookedFinish: new Date(Date.now() - 3600000).toISOString() } as Job);
describe("Driver list stays accessible without submission redirects", () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
  it("keeps the unfinished active card and ignores a legacy forced-manual redirect", async () => {
    const active = job("8AM"), next = job("9AM", "READY"), pending = job("PENDING", "COMPLETED");
    mocks.list.mockResolvedValue({ today: [active, next], past: [], next: [], pendingManualDetails: pending });
    const open = vi.fn(); render(<JobListScreen driver={driver} onOpenJob={open} onOpenProfile={vi.fn()} />);
    expect(await screen.findByText("Active 8AM")).toBeInTheDocument(); expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    expect(await screen.findByText("Upcoming 9AM")).toBeInTheDocument(); expect(open).not.toHaveBeenCalled();
    const reads = mocks.list.mock.calls.length;
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThan(reads));
    expect(screen.getByText("Upcoming 9AM")).toBeInTheDocument(); expect(open).not.toHaveBeenCalled();
  });
  it("does not add an earlier unfinished jobs section or reopening controls", async () => {
    mocks.list.mockResolvedValue({ today: [job("8AM")], past: [job("HISTORY")], next: [] });
    const open = vi.fn(); render(<JobListScreen driver={driver} onOpenJob={open} onOpenProfile={vi.fn()} />);
    expect(await screen.findByText("Active 8AM")).toBeInTheDocument();
    expect(screen.queryByText("Earlier unfinished jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
