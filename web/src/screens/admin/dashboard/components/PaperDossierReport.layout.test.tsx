import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../types";
import { paperJobSample, paperScenarioSample } from "../../../../../test/reportPreview.sample";
import { PAGE_CAPACITY_MM, PaperDossierReport, blockHeight, bookingChunks, buildDossierPages, documentDateTime, evidenceTitle } from "./PaperDossierReport";

const firstPage = (container: HTMLElement) => container.querySelectorAll(".report-preview-page")[0] as HTMLElement;
const photo = (index: number, at: string) => ({ ...paperJobSample.evidenceItems[0], id: `p${index}`, fileId: `p${index}`, category: "Photos", capturedAt: at });

describe("Job Report: data honesty", () => {
  it("prints missing money and payment as Not recorded, never as £0.00", () => {
    const job: NormalizedJob = { ...paperJobSample, basePrice: undefined, extraCharges: undefined, overtimeCharge: undefined, totalCharges: undefined, calculatedTotalCharges: undefined, amountCharged: undefined, paymentMethod: undefined, paymentBreakdown: undefined } as unknown as NormalizedJob;
    const { container } = render(<PaperDossierReport job={job} isPreview />);
    expect(container).not.toHaveTextContent("£0.00");
    const table = within(container as HTMLElement).getByText("Charges and payment").parentElement!;
    for (const label of ["Base price", "Calculated charge", "Final charge", "Payment"]) {
      expect(within(table).getByText(label).closest("tr")!).toHaveTextContent("Not recorded");
    }
  });

  it("labels every amount with its type so calculated, billed and received are never confused", () => {
    const job: NormalizedJob = { ...paperJobSample, paymentBreakdown: [{ method: "Card", amount: 20000 }, { method: "Invoice", amount: 15000 }] } as NormalizedJob;
    const { container } = render(<PaperDossierReport job={job} isPreview />);
    const table = within(container as HTMLElement).getByText("Charges and payment").parentElement!;
    expect(within(table).getByText("Final charge").closest("tr")!).toHaveTextContent("Billed");
    expect(within(table).getByText("Card").closest("tr")!).toHaveTextContent("Recorded receipt");
    expect(within(table).getByText("Invoice").closest("tr")!).toHaveTextContent("Invoice to collect");
    expect(within(table).getByText(/Recorded receipts/).closest("tr")!).toHaveTextContent("£200.00");
  });

  it("does not invent a signing time or a review email status", () => {
    const { container } = render(<PaperDossierReport job={{ ...paperJobSample, clientSignatureAt: undefined, reviewEmailStatus: undefined }} isPreview />);
    expect(container).toHaveTextContent("Signed: Not recorded");
    expect(container).toHaveTextContent("Review request email: Not recorded");
    expect(container).not.toHaveTextContent("RW=");
  });

  it("reads the review email status as Sent or Not sent", () => {
    const { container, rerender } = render(<PaperDossierReport job={{ ...paperJobSample, reviewEmailStatus: "Yes" }} isPreview />);
    expect(container).toHaveTextContent("Review request email: Sent");
    rerender(<PaperDossierReport job={{ ...paperJobSample, reviewEmailStatus: "No" }} isPreview />);
    expect(container).toHaveTextContent("Review request email: Not sent");
  });

  it("records payment and the customer signature whatever comes first in the evidence", () => {
    // A scenario submitted before every job photo used to take the page and drop the payment block.
    const job: NormalizedJob = { ...paperJobSample, paymentBreakdown: [{ method: "Card", amount: 20000 }], scenarios: [{ ...paperJobSample.scenarios[0], timestamp: "2026-10-10T07:00:00Z", photos: paperJobSample.scenarios[0].photos.map(p => ({ ...p, capturedAt: "2026-10-10T07:00:00Z" })) }] };
    const { container } = render(<PaperDossierReport job={job} isPreview />);
    expect(within(container as HTMLElement).getByText("Card").closest("tr")!).toHaveTextContent("Recorded receipt");
    expect(within(container as HTMLElement).getByRole("img", { name: "Client Signature" })).toBeInTheDocument();
    expect(container).toHaveTextContent("Confirmed by: Sample Customer");
  });

  it("names every milestone with its source and never gives a missing one a time", () => {
    const job: NormalizedJob = { ...paperJobSample, onMyWayAt: undefined, trackerArrivalAt: undefined, trackerUnverifiedReason: "GPS reports were stale", vanLoadedAt: undefined };
    const { container } = render(<PaperDossierReport job={job} isPreview />);
    const table = within(firstPage(container)).getByText("Schedule and timings").parentElement!;
    expect(within(table).getAllByRole("row")).toHaveLength(9);
    expect(within(table).getByText("On my way").closest("tr")!).toHaveTextContent("Driver app");
    expect(within(table).getByText("On my way").closest("tr")!).toHaveTextContent("Not recorded");
    expect(within(table).getByText("Tracker Pick-up arrival").closest("tr")!).toHaveTextContent("Unverified: GPS reports were stale");
    expect(within(table).getByText("Van loaded photo time").closest("tr")!).toHaveTextContent("Driver photo");
  });

  it("shows a scheduled job as not yet, never as missing", () => {
    const scheduled = { ...paperJobSample, status: "READY", onMyWayAt: undefined, trackerArrivalAt: undefined, pickupArrivalAt: undefined, vanLoadedAt: undefined, actualFinish: undefined, clientSignatureAt: undefined } as unknown as NormalizedJob;
    const { container } = render(<PaperDossierReport job={scheduled} isPreview />);
    const table = within(firstPage(container)).getByText("Schedule and timings").parentElement!;
    expect(table).toHaveTextContent("Not yet");
    expect(table).not.toHaveTextContent("Not recorded");
  });

  it("prints the original booking text as plain text, never as markup or a link", () => {
    const raw = "Call <b>Sam</b> on 07700 900123. Access: https://example.test/very/long/path?token=abc&x=1 <script>alert(1)</script>";
    const { container } = render(<PaperDossierReport job={{ ...paperJobSample, rawTitle: "4 hrs 2 men", rawDescription: raw }} isPreview />);
    const booking = container.querySelector(".report-booking pre")!;
    expect(booking).toBeTruthy();
    expect(container.querySelector(".report-booking script, .report-booking b, .report-booking a")).toBeNull();
    expect(container).toHaveTextContent("https://example.test/very/long/path?token=abc&x=1");
    expect(container).toHaveTextContent("Original booking information");
  });

  it("formats document dates as London time in the house style and keeps sheet-style values readable", () => {
    expect(documentDateTime("2026-09-22T15:45:00Z")).toBe("22 Sep 2026, 16:45");
    expect(documentDateTime(undefined)).toBe("Not recorded");
    expect(documentDateTime("22/09/2026 16:45")).toBe("22/09/26");
  });

  it("names photo sections in words", () => {
    expect(evidenceTitle("VanLoaded")).toBe("Van loaded");
    expect(evidenceTitle("EmptyVan")).toBe("Empty van");
    expect(evidenceTitle(undefined)).toBe("Photo");
  });
});

describe("Job Report: pagination", () => {
  const manyPhotos: NormalizedJob = {
    ...paperJobSample,
    evidenceItems: Array.from({ length: 9 }, (_, i) => photo(i, `2026-10-10T09:${String(10 + i)}:00Z`)) as NormalizedJob["evidenceItems"],
    scenarios: [{ ...paperScenarioSample, id: "S", kind: "liability", clientPresent: "Yes", signature: { ...paperScenarioSample.signature, fileId: "sig" }, timestamp: "2026-10-10T09:15:30Z",
      photos: Array.from({ length: 5 }, (_, i) => ({ ...paperScenarioSample.photos[0], fileId: `l${i}`, capturedAt: "2026-10-10T09:15:30Z" })) }] as NormalizedJob["scenarios"]
  };

  it("fills no page past the A4 capacity and never ends a page on a heading", () => {
    for (const job of [paperJobSample, manyPhotos]) {
      for (const page of buildDossierPages(job)) {
        expect(page.reduce((sum, block) => sum + blockHeight(block), 0)).toBeLessThanOrEqual(PAGE_CAPACITY_MM);
        expect(page[page.length - 1].kind).not.toBe("heading");
      }
    }
  });

  it("puts two photos per row, keeps submission order, and repeats a carried-over heading", () => {
    const pages = buildDossierPages(manyPhotos);
    const blocks = pages.flat();
    expect(blocks[0].kind).toBe("charges");
    expect(blocks.some(block => block.kind === "time")).toBe(true);
    const rows = blocks.filter(block => block.kind === "photos");
    expect(rows.every(row => row.kind === "photos" && row.photos.length <= 2)).toBe(true);
    // 9 job photos and 5 scenario photos, nothing lost.
    expect(rows.reduce((sum, row) => sum + (row.kind === "photos" ? row.photos.length : 0), 0)).toBe(14);
    // The liability report sits between the job photos taken before and after it.
    const titles = blocks.filter(block => block.kind === "heading").map(block => block.kind === "heading" ? block.title : "");
    expect(titles.indexOf("Liability report")).toBeGreaterThan(titles.indexOf("Job photos"));
    expect(titles.lastIndexOf("Job photos")).toBeGreaterThan(titles.indexOf("Liability report"));
    expect(titles.some(title => title.endsWith("(continued)"))).toBe(true);
  });

  it("says so when a job has no photos instead of leaving a blank page", () => {
    render(<PaperDossierReport job={{ ...paperJobSample, evidenceItems: [], scenarios: [] }} isPreview />);
    expect(screen.getByText("No job photos were recorded.")).toBeInTheDocument();
  });
});

describe("Job Report: original booking text", () => {
  it("splits long text into page-sized chunks without losing a character", () => {
    const text = Array.from({ length: 120 }, (_, i) => `Line ${i} ${"x".repeat(60)}`).join("\n");
    const chunks = bookingChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map(chunk => chunk.text).join("\n")).toBe(text);
    expect(chunks.every(chunk => chunk.lines <= 34)).toBe(true);
  });
  it("slices a single very long URL so it can cross pages", () => {
    const url = `https://example.test/${"a".repeat(9000)}`;
    const chunks = bookingChunks(url);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map(chunk => chunk.text).join("")).toBe(url);
  });
  it("keeps every page within the A4 capacity with a long booking text", () => {
    const job = { ...paperJobSample, rawTitle: "t", rawDescription: Array.from({ length: 200 }, (_, i) => `Booking line ${i} ${"y".repeat(40)}`).join("\n") } as NormalizedJob;
    for (const page of buildDossierPages(job)) expect(page.reduce((sum, block) => sum + blockHeight(block), 0)).toBeLessThanOrEqual(PAGE_CAPACITY_MM);
  });
});
