import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobStatusBadge } from "./StatusBadge";

describe("Job status badge", () => {
  const notice = {
    kind: "driver-completed" as const, detectedAt: "2026-10-16T10:00:00Z",
    previousStart: "2026-10-13T08:00:00Z", previousFinish: "2026-10-13T10:00:00Z", previousDriverInitials: "TI",
    scheduledStart: "2026-10-16T13:00:00Z", scheduledFinish: "2026-10-16T15:00:00Z", driverInitials: "MK"
  };

  it("shows a red completed-job reassignment warning without changing the completion label", () => {
    render(<JobStatusBadge status="COMPLETED" rescheduleNotice={notice} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    const warning = screen.getByText("Completed job reassigned").parentElement!;
    expect(warning).toHaveClass("bg-admin-status-red-bg");
    expect(warning).toHaveAttribute("title", "Calendar schedule: 16 Oct 2026, 14:00; driver: MK");
  });

  it("shows a yellow admin-completion warning on the fresh scheduled attempt", () => {
    render(<JobStatusBadge status="READY" rescheduleNotice={{ ...notice, kind: "admin-completed" }} />);
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Admin completed job reassigned").parentElement).toHaveClass("bg-admin-status-amber-bg");
    expect(screen.queryByText("Admin Completed")).not.toBeInTheDocument();
  });
  it("distinguishes admin-completed jobs using the completion audit entry", () => {
    render(<JobStatusBadge status="COMPLETED" activity={[{ action: "ADMIN_MARKED_COMPLETED" }]} />);
    expect(screen.getByText("Admin Completed")).toBeInTheDocument();
  });

  it("keeps normal driver completion labelled Completed", () => {
    render(<JobStatusBadge status="COMPLETED" activity={[{ action: "OPS_JOB_COMPLETION_EMAIL_SENT" }]} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Admin Completed")).not.toBeInTheDocument();
  });

  it("preserves the existing label when activity is unavailable", () => {
    render(<JobStatusBadge status="COMPLETED" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("does not override the current status with an older completion entry", () => {
    render(<JobStatusBadge status="CANCELLED" activity={[{ action: "ADMIN_MARKED_COMPLETED" }]} />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Admin Completed")).not.toBeInTheDocument();
  });
});
