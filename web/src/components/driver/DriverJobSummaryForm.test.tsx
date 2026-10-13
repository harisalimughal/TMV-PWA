import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverJobSummaryForm, clearManualDetailsDraft } from "./DriverJobSummaryForm";
import type { Job } from "../../api/jobs";

const job = { jobId: "MANUAL-TEST", driverInitials: "AB", status: "COMPLETED" } as Job;
describe("Driver Manual details hours", () => {
  beforeEach(() => localStorage.clear());
  it("shows only two dropdowns with every half-hour from 2:00 through 14:00", () => {
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      const options = within(select).getAllByRole("option").slice(1);
      expect(options).toHaveLength(25);
      expect(options.map(option => option.textContent)).toEqual(Array.from({ length: 25 }, (_, i) => `${2 + Math.floor(i / 2)}:${i % 2 ? "30" : "00"}`));
    }
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("requires driver hours and submits only the selected hours, allowing no helper", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Driver job hours/), { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Manual details/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ schemaVersion: 3, driverJobHours: "3.5", helperHours: "" }));
  });
  it("restores both hours after navigation and clears the draft on confirmed success", () => {
    const view = render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Driver job hours/), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Helper job hours"), { target: { value: "2.5" } });
    view.unmount();
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Driver job hours/)).toHaveValue("14");
    expect(screen.getByLabelText("Helper job hours")).toHaveValue("2.5");
    clearManualDetailsDraft(job);
    expect(localStorage.getItem("tmv:manual-details:v3:AB:MANUAL-TEST")).toBeNull();
  });
  it("prevents repeated taps while submission is in flight", async () => {
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<DriverJobSummaryForm job={job} submitting={false} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText(/Driver job hours/), { target: { value: "2" } });
    const button = screen.getByRole("button", { name: /Submit Manual details/ });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    finish();
  });
});
