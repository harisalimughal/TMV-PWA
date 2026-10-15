import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobStatusBadge } from "./StatusBadge";

describe("Job status badge", () => {
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
