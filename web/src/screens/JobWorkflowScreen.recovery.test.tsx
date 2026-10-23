import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobWorkflowScreen } from "./JobWorkflowScreen";
import type { Job } from "../api/jobs";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), action: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api/jobs", async original => ({ ...await original<typeof import("../api/jobs")>(), fetchJobDetail: mocks.detail, sendAction: mocks.action }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("../app/AppShell", () => ({ AppShell: ({ children, header, dock }: { children: React.ReactNode; header?: React.ReactNode; dock?: React.ReactNode }) => <div>{header}{children}{dock}</div> }));

const job: Job = {
  jobId: "FLOW-RECOVERY", driverInitials: "WA", customerName: "Customer", status: "IN_PROGRESS", currentState: "WAITING_EXTRA_CHARGES",
  bookedStart: "", bookedFinish: "", actualStart: "", actualFinish: "", bookedMinutes: 90, actualMinutes: 120,
  extraCharges: [], overtimeMinutes: 0, overtimeCharge: 0, paymentMethod: "", totalCharges: 100,
  pickup: "London", dropoff: "London", crewSize: 2, basePrice: 100,
  calendarEventId: "fixture", customerEmail: "", customerPhone: "", paidOnline: false,
  differenceMinutes: 30, delayStatus: "On Time", paymentStatus: "", clientNamePostcode: "", clientConfirmedBy: "Customer",
  signatureUrl: "", createdAt: "", updatedAt: ""
};
const response = (currentJob = job, suggestedTotal = 100) => ({ job: currentJob, suggestedTotal, evidenceItems: [] });
const mismatch = "This action is not valid at the current step (WAITING_TOTAL_CHARGES). Expected WAITING_EXTRA_CHARGES.";

async function submitExtras() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "No Extras Time" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("Workflow submission recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.detail.mockResolvedValue(response());
  });

  it.each([mismatch, "Request timed out"])("shows the saved next step after %s without replaying the action", async message => {
    mocks.detail.mockResolvedValueOnce(response()).mockResolvedValue(response({ ...job, currentState: "WAITING_TOTAL_CHARGES" }, 135));
    mocks.action.mockRejectedValueOnce({ message });
    const back = vi.fn();
    render(<JobWorkflowScreen jobId={job.jobId} onBack={back} />);
    await submitExtras();

    expect(await screen.findByText("Total to charge")).toBeInTheDocument();
    expect(screen.getByText("£135.00")).toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith(job.jobId, "SUBMIT_EXTRA_CHARGES", { extra_charges: ["No Extras Time"] });
    expect(back).not.toHaveBeenCalled();
  });

  it("keeps the error and selected charges when the server is still on the same step", async () => {
    mocks.action.mockRejectedValueOnce({ message: "Could not save charges" });
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    await submitExtras();

    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Could not save charges")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "No Extras Time" })).toBeChecked();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("keeps the original error and allows retry if refreshing also fails", async () => {
    mocks.detail.mockResolvedValueOnce(response()).mockRejectedValueOnce({ message: "Refresh failed" });
    mocks.action.mockRejectedValueOnce({ message: "Connection lost" }).mockResolvedValueOnce(response({ ...job, currentState: "WAITING_TOTAL_CHARGES" }));
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    await submitExtras();

    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled());
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "No Extras Time" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Total to charge")).toBeInTheDocument();
    expect(mocks.action).toHaveBeenCalledTimes(2);
  });

  it("blocks a back action while a submission is in flight", async () => {
    let finish!: (result: ReturnType<typeof response>) => void;
    mocks.action.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    await submitExtras();
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(mocks.action).toHaveBeenCalledTimes(1);
    await act(async () => finish(response({ ...job, currentState: "WAITING_TOTAL_CHARGES" })));
    expect(await screen.findByText("Total to charge")).toBeInTheDocument();
  });
});
