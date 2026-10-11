import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobWorkflowScreen } from "./JobWorkflowScreen";
import type { Job } from "../api/jobs";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), submit: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../api/jobs", async original => ({ ...await original<typeof import("../api/jobs")>(), fetchJobDetail: mocks.detail, submitDriverJobSummary: mocks.submit }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("../app/AppShell", () => ({ AppShell: ({ children, header, dock }: { children: React.ReactNode; header?: React.ReactNode; dock?: React.ReactNode }) => <div>{header}{children}{dock}</div> }));
vi.mock("../lib/jobsRefresh", () => ({ notifyJobsRefresh: vi.fn() }));

const job: Job = {
  jobId: "FLOW-MANUAL", driverInitials: "AB", customerName: "Customer", status: "COMPLETED", currentState: "COMPLETED",
  manualDetailsRequiredAt: "2026-10-09T12:00:00Z", bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:30:00Z",
  actualFinish: "2026-10-09T11:00:00Z", bookedMinutes: 90, actualMinutes: 120,
  extraCharges: [], overtimeMinutes: 0, overtimeCharge: 0, paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amount: 100 }], totalCharges: 100, amountCharged: 100,
  pickup: "London", dropoff: "London", crewSize: 2, basePrice: 100,
  calendarEventId: "fixture", customerEmail: "", customerPhone: "", paidOnline: false,
  actualStart: "2026-10-09T09:00:00Z", differenceMinutes: 30, delayStatus: "On Time",
  paymentStatus: "Recorded", clientNamePostcode: "", clientConfirmedBy: "Customer",
  signatureUrl: "", createdAt: "2026-10-09T09:00:00Z", updatedAt: "2026-10-09T12:00:00Z"
};
const response = (overrides = {}) => ({ job, suggestedTotal: 100, driverJobSummary: null, evidence: { completed: {}, pending: {}, failed: {} }, evidenceItems: [], ...overrides });

describe("Automatic Manual details workflow", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.detail.mockResolvedValue(response()); });
  it("opens the form automatically for a newly completed job", async () => {
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Manual details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Do later" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to your jobs" })).not.toBeInTheDocument();
  });
  it("preserves the draft if normal navigation leaves the immediate completion form", async () => {
    const back = vi.fn();
    render(<JobWorkflowScreen jobId={job.jobId} onBack={back} />);
    await screen.findByRole("heading", { name: "Manual details" });
    fireEvent.change(screen.getByLabelText(/Cash amount/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to jobs" }));
    expect(back).toHaveBeenCalledOnce(); expect(mocks.submit).not.toHaveBeenCalled();
    expect(localStorage.getItem(`tmv:manual-details:v2:AB:${job.jobId}`)).not.toBeNull();
  });
  it("preserves the edited draft and shows save failure, then releases the queue on retry success", async () => {
    const back = vi.fn();
    mocks.submit.mockRejectedValueOnce({ message: "Network interrupted" }).mockResolvedValueOnce({ summary: { jobId: job.jobId } });
    render(<JobWorkflowScreen jobId={job.jobId} onBack={back} />);
    await screen.findByRole("heading", { name: "Manual details" });
    fireEvent.change(screen.getByLabelText(/Cash amount/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    expect(await screen.findByText("Network interrupted")).toBeInTheDocument();
    expect(screen.getByLabelText(/Cash amount/)).toHaveValue("95");
    expect(back).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    await waitFor(() => expect(back).toHaveBeenCalledOnce());
    expect(localStorage.getItem(`tmv:manual-details:v2:AB:${job.jobId}`)).toBeNull();
  });
  it("does not require a new form for a historical completion", async () => {
    mocks.detail.mockResolvedValue(response({ job: { ...job, manualDetailsRequiredAt: undefined } }));
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    expect(await screen.findByText("Historical job")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manual details" })).not.toBeInTheDocument();
  });
  it("renders a clean pound symbol for payment-method amount inputs", async () => {
    mocks.detail.mockResolvedValue(response({ job: { ...job, status: "IN_PROGRESS", currentState: "WAITING_PAYMENT", manualDetailsRequiredAt: undefined } }));
    render(<JobWorkflowScreen jobId={job.jobId} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Card" }));
    const amount = await screen.findByLabelText(/Card amount taken/);
    expect(amount.parentElement).toHaveTextContent("\u00a3");
    expect(amount.parentElement).not.toHaveTextContent("\u00c2");
  });
});
