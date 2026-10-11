import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverJobSummaryForm, clearManualDetailsDraft } from "./DriverJobSummaryForm";
import type { Job } from "../../api/jobs";

const job = {
  jobId: "MANUAL-TEST", driverInitials: "AB", status: "COMPLETED", manualDetailsRequiredAt: "2026-10-09T12:00:00Z",
  bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:30:00Z",
  actualStart: "2026-10-09T09:15:00Z", actualFinish: "2026-10-09T11:00:00Z",
  paymentMethod: "Cash, Card, Bank Transfer, Invoice", amountCharged: 250, totalCharges: 250,
  paymentBreakdown: [{ method: "Cash", amount: 50 }, { method: "Card", amount: 100 }, { method: "Bank Transfer", amount: 25 }, { method: "Invoice", amount: 0 }],
  extraCharges: ["London Congestion charge", "Tunnel Charges"], chargeSnapshot: { basePence: 21840, congestionPence: 1800, tunnelPence: 1360 }
} as Job;

describe("Driver Manual details form", () => {
  beforeEach(() => localStorage.clear());
  it("prefills the booking start in London, recorded finish and editable per-method amounts", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={submit} />);
    expect(screen.getByLabelText(/Start time/)).toHaveValue("2026-10-09T10:00");
    expect(screen.getByLabelText(/End time/)).toHaveValue("2026-10-09T12:00");
    expect(screen.getByLabelText(/Bank Transfer amount/)).toHaveValue("25.00");
    expect(screen.getByLabelText(/Invoice amount/)).toHaveValue("75.00");
    expect(screen.getByText("Total collected: GBP 175.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Cash amount/), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({ startTime: "2026-10-09T09:00:00.000Z", endTime: "2026-10-09T11:00:00.000Z", helperName: "", helperHours: "", paymentAmounts: { Cash: "60", Invoice: "75.00" } });
    expect(submit.mock.calls[0][0].chargeItems).toHaveLength(2);
  });
  it("restores a draft after reload and clears it only on confirmed success", () => {
    const view = render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Helper name"), { target: { value: "Thiago" } });
    fireEvent.change(screen.getByLabelText("Hours on this job"), { target: { value: "1.5" } });
    view.unmount();
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Helper name")).toHaveValue("Thiago");
    expect(screen.getByLabelText("Hours on this job")).toHaveValue("1.5");
    clearManualDetailsDraft(job);
    expect(localStorage.getItem("tmv:manual-details:v2:AB:MANUAL-TEST")).toBeNull();
  });
  it("retains an unsent draft beyond the weekly review cycle", () => {
    const view = render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Helper name"), { target: { value: "Pending helper" } });
    view.unmount();
    const draftKey = "tmv:manual-details:v2:AB:MANUAL-TEST";
    const saved = JSON.parse(localStorage.getItem(draftKey)!);
    localStorage.setItem(draftKey, JSON.stringify({ ...saved, savedAt: Date.now() - 14 * 86400_000 }));
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Helper name")).toHaveValue("Pending helper");
  });
  it("supports explicit no payment received without inventing prepaid collections", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<DriverJobSummaryForm job={{ ...job, paidOnline: true, paymentMethod: "", paymentBreakdown: [], extraCharges: [] }} submitting={false} onSubmit={submit} />);
    expect(screen.getByText("Choose a payment method or No payment received.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "No payment received" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toMatchObject({ noPaymentReceived: true, paymentMethods: [] });
  });
  it("does not guess the historical combined Invoice/Transfer method", () => {
    render(<DriverJobSummaryForm job={{ ...job, paymentMethod: "Invoice/Transfer", paymentBreakdown: [] }} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Invoice" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bank Transfer" })).not.toBeChecked();
  });
  it("adds tunnel crossings without adding their components to the collection total", () => {
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add tunnel crossing" }));
    expect(screen.getAllByText("Tunnel crossing")).toHaveLength(2);
    expect(screen.getByText("Total collected: GBP 175.00")).toBeInTheDocument();
  });
  it("blocks unnamed helper hours and invalid payment precision", () => {
    const submit = vi.fn();
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText("Hours on this job"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Hours on this job"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Cash amount/), { target: { value: "0.001" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    expect(submit).not.toHaveBeenCalled();
  });
  it("prevents repeated taps while submission is in flight and keeps the draft", async () => {
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={submit} />);
    const button = screen.getByRole("button", { name: /Submit Manual details/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(localStorage.getItem("tmv:manual-details:v2:AB:MANUAL-TEST")).not.toBeNull();
    finish();
  });
});
