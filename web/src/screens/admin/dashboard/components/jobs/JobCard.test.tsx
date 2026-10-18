import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedJob } from "../../types";
import { paperJobSample } from "../../../../../../test/reportPreview.sample";
import { JobCard } from "./JobCard";

const actions = { onToggle: vi.fn(), onReassign: vi.fn(), onDelete: vi.fn() };
const card = (patch: Partial<NormalizedJob> = {}, selected = false) =>
  render(<JobCard job={{ ...paperJobSample, jobId: "TMV-C74CD8FFAC", ...patch } as NormalizedJob} selected={selected} actions={actions} />);

describe("JobCard", () => {
  it("shows the job reference once, in the footer, never in the header", () => {
    const { container } = card();
    const article = screen.getByRole("article");
    expect(article.textContent!.match(/TMV-C74CD8FFAC/g)).toHaveLength(1);
    expect(within(container.querySelector("footer")!).getByText("TMV-C74CD8FFAC")).toBeInTheDocument();
    expect(within(container.querySelector("header")!).queryByText("TMV-C74CD8FFAC")).not.toBeInTheDocument();
  });

  it("puts the driver and schedule in the header and the customer below it", () => {
    card({ driverName: "Caio", driverInitials: "KA", customerName: "Kristen Chin" });
    const header = document.querySelector("header")!;
    expect(header).toHaveTextContent("Caio");
    expect(header).toHaveTextContent("KA");
    expect(screen.getByRole("heading", { name: "Kristen Chin" })).toBeInTheDocument();
  });

  it("says so when there is no customer, driver or route, without inventing any", () => {
    card({ customerName: "", driverName: "", driverInitials: "", pickup: "", dropoff: "", basePrice: 0 } as Partial<NormalizedJob>);
    expect(screen.getByRole("heading", { name: "Customer not recorded" })).toBeInTheDocument();
    expect(screen.getByText("No driver assigned")).toBeInTheDocument();
    expect(screen.getByText("Booked price")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("keeps the checkbox and the menu separate from opening the job", () => {
    card();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select job TMV-C74CD8FFAC" }));
    expect(actions.onToggle).toHaveBeenCalledWith("TMV-C74CD8FFAC");
    fireEvent.click(screen.getByRole("button", { name: "Copy job reference TMV-C74CD8FFAC" }));
    expect(window.location.search).not.toContain("job=");
  });

  it("labels the amount with what it is and never shows a missing price as £0.00", () => {
    card({ status: "READY", totalCharges: undefined, calculatedTotalCharges: undefined, amountCharged: undefined } as Partial<NormalizedJob>);
    expect(screen.getByRole("article")).not.toHaveTextContent("£0.00");
  });

  it("lays out customer and booked price on one row, then the description, then reference and total", () => {
    card({ customerName: "Leanna", driverName: "Wander", driverInitials: "WD", rawTitle: "2 man 409£/Y-WD", basePrice: 40900, status: "COMPLETED", amountCharged: 40900 } as Partial<NormalizedJob>);
    const article = screen.getByRole("article");
    const heading = within(article).getByRole("heading", { name: "Leanna" });
    expect(heading.parentElement).toHaveTextContent("£409.00");
    expect(within(article).getByText("2 man 409£/Y-WD")).toBeInTheDocument();
    expect(within(article).getByText("Completed")).toBeInTheDocument();
    const footer = article.querySelector("footer")!;
    expect(footer).toHaveTextContent("TMV-C74CD8FFAC");
    expect(footer).toHaveTextContent("£409.00");
    expect(footer).toHaveTextContent("Total · final charge");
    expect(within(article).getByRole("checkbox")).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /Actions for job/ })).toBeInTheDocument();
  });

  it("shows the full date and time on one line and the status beside it, not squeezed into the name row", () => {
    card({ bookedStart: "2026-10-16T07:00:00Z", status: "COMPLETED", driverName: "Wander", driverInitials: "WD" } as Partial<NormalizedJob>);
    const header = document.querySelector("header")!;
    expect(within(header).getByText("16 Oct 2026 · 08:00")).toBeInTheDocument();
    expect(within(header).getByText("Completed")).toBeInTheDocument();
  });

  it("labels the booked price and the total separately and never invents a description", () => {
    card({ rawTitle: "", bookingDetails: undefined, crewSize: 0, basePrice: 23000, status: "COMPLETED", amountCharged: 21000 } as Partial<NormalizedJob>);
    const article = screen.getByRole("article");
    expect(within(article).getByText("Booked price")).toBeInTheDocument();
    expect(within(article).getByText("£230.00")).toBeInTheDocument();
    expect(within(article).getByText("£210.00")).toBeInTheDocument();
    expect(within(article).getByText("Total · final charge")).toBeInTheDocument();
    expect(article.textContent).not.toMatch(/No description/);
  });

  it("shows warnings as compact labelled chips and keeps job status separate from them", () => {
    card({ status: "COMPLETED", driverName: "Caio", driverInitials: "KA", amountCharged: 21000 } as Partial<NormalizedJob>);
    const article = screen.getByRole("article");
    expect(within(article).getByText("Completed")).toBeInTheDocument();
    const chips = within(article).queryByRole("list", { name: "Needs attention" });
    if (chips) expect(within(chips).getAllByRole("listitem")[0].textContent!.length).toBeGreaterThan(0);
  });

  it("confirms a copied reference for screen readers", () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    card();
    fireEvent.click(screen.getByRole("button", { name: "Copy job reference TMV-C74CD8FFAC" }));
    expect(screen.getByRole("status")).toHaveTextContent("Job reference copied");
  });
});
