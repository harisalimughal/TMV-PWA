import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ReportReturnButton } from "./ReportReturnButton";
import { reportJobHref, reportReturnHref } from "../utils/reportNavigation";
const source = "/admin?section=driverreport&driver=MA&from=2026-10-05&to=2026-10-11&reportTab=comparison&jobsPage=3&groupBy=week";
beforeEach(() => window.history.replaceState({}, "", source));
describe("Return from job to originating driver report", () => {
  it("restores the exact driver, range, tab, page and grouping even after reloading a job link", () => {
    const jobHref = reportJobHref("TMV-001");
    window.history.replaceState({}, "", jobHref);
    expect(reportReturnHref()).toBe(source);
    render(<ReportReturnButton compact />);
    fireEvent.click(screen.getByRole("button", { name: "Back to Driver Breakdown" }));
    expect(location.pathname + location.search).toBe(source);
    expect(screen.queryByRole("button", { name: "Back to Driver Breakdown" })).not.toBeInTheDocument();
  });
  it.each(["https://example.com/admin?section=driverreport&driver=MA", "//example.com/admin?section=driverreport&driver=MA", "/other?section=driverreport&driver=MA", "/admin?section=jobs&driver=MA", "/admin?section=driverreport"])("rejects unsafe or unrelated return destinations: %s", target => {
    window.history.replaceState({}, "", `/admin?section=finished&job=ONE&reportReturn=${encodeURIComponent(target)}`);
    expect(reportReturnHref()).toBeNull();
    render(<ReportReturnButton />);
    expect(screen.queryByRole("button", { name: "Back to Driver Breakdown" })).not.toBeInTheDocument();
  });
  it("does not add a report return button to ordinary job navigation", () => {
    window.history.replaceState({}, "", "/admin?section=jobs");
    const href = reportJobHref("ONE", false);
    expect(new URL(href, location.origin).searchParams.has("reportReturn")).toBe(false);
    render(<ReportReturnButton />);
    expect(screen.queryByRole("button", { name: "Back to Driver Breakdown" })).not.toBeInTheDocument();
  });
});
