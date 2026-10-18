import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import { GenerateReportModal } from "./GenerateReportModal";

const api = vi.hoisted(() => ({ fetchDriverReport: vi.fn() }));
const download = vi.hoisted(() => ({ downloadDriverReport: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), fetchDriverReport: api.fetchDriverReport }));
vi.mock("../utils/driverReportDownload", () => download);
const print = vi.hoisted(() => ({ printDocument: vi.fn() }));
vi.mock("../utils/printSession", () => print);
const OPTIONS = [{ initials: "AR", fullName: "Aragao", active: true }, { initials: "KA", fullName: "Caio", active: true }, { initials: "RF", fullName: "Rafael", active: true }];
const roster = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetch: vi.fn() }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => roster.current }));
const loaded = () => ({ isLoading: false, isError: false, isFetching: false, options: OPTIONS, refetch: roster.refetch });

type Initial = Parameters<typeof GenerateReportModal>[0]["initial"];
const tree = (open: boolean, initial?: Initial) => <QueryClientProvider client={new QueryClient()}><GenerateReportModal open={open} onClose={vi.fn()} initial={initial} /></QueryClientProvider>;
const renderModal = (initial?: Initial) => render(tree(true, initial));
/** A fetch that waits until the test lets it through, so a run can be held in progress. */
const gate = () => { let open!: () => void; const wait = new Promise<void>(resolve => { open = resolve; }); return { wait, open }; };
const generate = () => fireEvent.click(within(dialog()).getByRole("button", { name: "Generate Preview" }));
const dialog = () => screen.getByRole("dialog");
const stat = (preview: HTMLElement, label: string) => within(preview).getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const setCustom = (from: string, to: string) => {
  fireEvent.click(within(dialog()).getByRole("radio", { name: "Custom range" }));
  fireEvent.change(within(dialog()).getByLabelText("From date"), { target: { value: from } });
  fireEvent.change(within(dialog()).getByLabelText("To date"), { target: { value: to } });
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  print.printDocument.mockReset().mockResolvedValue(undefined);
  roster.current = loaded(); roster.refetch.mockReset();
  api.fetchDriverReport.mockReset().mockImplementation((initials: string, query: Record<string, string | number>) => sampleDriverReport(initials, query));
  download.downloadDriverReport.mockReset().mockResolvedValue(undefined);
});

describe("Generate Report dialog", () => {
  it("loads only the driver chosen on a profile and previews the real totals", async () => {
    renderModal({ drivers: ["KA"] });
    setCustom("2026-10-05", "2026-10-11");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Generate Preview" }));
    const preview = await screen.findByRole("region", { name: "Report preview" });
    expect(api.fetchDriverReport.mock.calls.every(([initials]) => initials === "KA")).toBe(true);
    expect(within(preview).getByText(/5 Oct 2026 to 11 Oct 2026, London time/)).toBeInTheDocument();
    expect(stat(preview, "Jobs")).toBe("36");
    expect(within(dialog()).getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });

  it("asks for a driver before generating and for a sensible date range", () => {
    renderModal();
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Choose drivers" }));
    expect(within(dialog()).getByText("Choose at least one driver.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Rafael/ }));
    setCustom("2026-10-15", "2026-10-09");
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("The end date is before the start date.");
    expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
    expect(api.fetchDriverReport).not.toHaveBeenCalled();
  });

  it("says no jobs were found for an empty period", async () => {
    renderModal({ drivers: ["RF"] });
    setCustom("2026-09-01", "2026-09-02");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Generate Preview" }));
    expect(await screen.findByText("No jobs found for the selected period.")).toBeInTheDocument();
  });

  it("leaves drivers without jobs out of an all-drivers report and names them", async () => {
    api.fetchDriverReport.mockImplementation((initials: string, query: Record<string, string | number>) =>
      sampleDriverReport(initials, initials === "AR" ? { ...query, from: "2026-09-01", to: "2026-09-02" } : query));
    renderModal();
    setCustom("2026-10-05", "2026-10-11");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Generate Preview" }));
    const preview = await screen.findByRole("region", { name: "Report preview" });
    expect(api.fetchDriverReport.mock.calls.map(([initials]) => initials)).toEqual(expect.arrayContaining(["AR", "KA", "RF"]));
    expect(within(preview).getByText(/No jobs in this period: .*\(AR\)/)).toBeInTheDocument();
    expect(stat(preview, "Jobs")).toBe("72"); // KA and RF; AR had none
  });

  it("shows the server's error instead of a success message", async () => {
    api.fetchDriverReport.mockRejectedValue(new Error("Driver report could not be loaded."));
    renderModal({ drivers: ["KA"] });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Generate Preview" }));
    expect(await screen.findByText("Driver report could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Report preview" })).not.toBeInTheDocument();
  });

  it("downloads the server's driver breakdown for one driver and period", async () => {
    renderModal();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Driver breakdown/ }));
    fireEvent.change(within(dialog()).getByLabelText("Driver"), { target: { value: "AR" } });
    setCustom("2026-10-09", "2026-10-15");
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Excel (.xlsx)" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Download Excel (.xlsx)" }));
    expect(await screen.findByText(/Downloaded the Excel \(\.xlsx\) driver breakdown for Aragao/)).toBeInTheDocument();
    expect(download.downloadDriverReport).toHaveBeenCalledWith("AR", "2026-10-08T23:00:00.000Z", "2026-10-15T22:59:59.999Z", "day", "xlsx", expect.any(AbortSignal));
  });

  describe("request snapshot and state safety", () => {
    it("locks the controls while loading, and the result belongs to the selections used", async () => {
      const held = gate();
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => { await held.wait; return sampleDriverReport(initials, query); });
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("Loading"));
      expect(within(dialog()).getByRole("radio", { name: "Last week" })).toBeDisabled();
      expect(within(dialog()).getByLabelText("From date")).toBeDisabled();
      expect(within(dialog()).getByRole("radio", { name: /Driver breakdown/ })).toBeDisabled();
      expect(within(dialog()).getByRole("button", { name: "Cancel generation" })).toBeEnabled();
      expect(within(dialog()).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
      await act(async () => { held.open(); });
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText(/\(KA\)/)).toBeInTheDocument();
      expect(api.fetchDriverReport.mock.calls.every(([initials]) => initials === "KA")).toBe(true);
    });

    it("ignores repeated Generate clicks while a run is active", async () => {
      const held = gate();
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => { await held.wait; return sampleDriverReport(initials, query); });
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-06");
      const button = within(dialog()).getByRole("button", { name: "Generate Preview" });
      fireEvent.click(button); fireEvent.click(button); fireEvent.click(button);
      await act(async () => { held.open(); });
      await screen.findByRole("region", { name: "Report preview" });
      expect(api.fetchDriverReport.mock.calls.filter(([, query]) => query.jobsPage === 1)).toHaveLength(1);
    });

    it("cancelling a run returns to the form, and the cancelled run cannot overwrite a newer one", async () => {
      const held = gate();
      let first = true;
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => {
        if (first) { first = false; await held.wait; }
        return sampleDriverReport(initials, query);
      });
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await waitFor(() => expect(within(dialog()).getByRole("status")).toBeInTheDocument());
      fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel generation" }));
      expect(within(dialog()).queryByText(/Loading driver reports|Loading the report/)).not.toBeInTheDocument();
      expect(within(dialog()).getByText("Generation cancelled")).toBeInTheDocument();
      expect(within(dialog()).getByRole("radio", { name: "Last week" })).toBeEnabled();
      // A newer run for another driver.
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Choose drivers" }));
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Caio/ }));
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Rafael/ }));
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText(/\(RF\)/)).toBeInTheDocument();
      await act(async () => { held.open(); });   // the cancelled run now finishes late
      expect(screen.getAllByRole("region", { name: "Report preview" })).toHaveLength(1);
      expect(within(screen.getByRole("region", { name: "Report preview" })).queryByText(/\(KA\)/)).not.toBeInTheDocument();
    });

    it("discards the result when the form is edited afterwards, and Reset restores the opening selections", async () => {
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByRole("region", { name: "Report preview" });
      fireEvent.change(within(dialog()).getByLabelText("To date"), { target: { value: "2026-10-12" } });
      expect(screen.queryByRole("region", { name: "Report preview" })).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Reset" }));
      expect(within(dialog()).getByRole("radio", { name: "Last week" })).toBeChecked();
      expect(within(dialog()).getByText(/This report will cover:/)).toHaveTextContent("Caio (KA)");
    });

    it("does not let a response that arrives after the modal closed come back when it reopens", async () => {
      const held = gate();
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => { await held.wait; return sampleDriverReport(initials, query); });
      const view = renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await waitFor(() => expect(within(dialog()).getByRole("status")).toBeInTheDocument());
      view.rerender(tree(false, { drivers: ["KA"] }));
      await act(async () => { held.open(); });
      view.rerender(tree(true, { drivers: ["KA"] }));
      expect(screen.queryByRole("region", { name: "Report preview" })).not.toBeInTheDocument();
      expect(within(dialog()).queryByRole("status")).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
    });

    it("shows a partial report with the successful and failed counts, and a downloadable partial file", async () => {
      api.fetchDriverReport.mockImplementation((initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query));
      renderModal();
      setCustom("2026-10-05", "2026-10-11");
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText("Report partially generated")).toBeInTheDocument();
      expect(within(preview).getByText(/2 of 3 drivers loaded successfully\. 1 could not be loaded: RF/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Download partial PDF" })).toBeEnabled();
      expect(within(preview).getByRole("button", { name: "Retry failed drivers" })).toBeInTheDocument();
    });

    it("retries only the failed drivers, keeps the others, and ends complete", async () => {
      let fail = true;
      api.fetchDriverReport.mockImplementation((initials: string, query: Record<string, string | number>) => initials === "RF" && fail ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query));
      renderModal();
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByText("Report partially generated");
      fail = false; api.fetchDriverReport.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Retry failed drivers" }));
      await waitFor(() => expect(screen.queryByText("Report partially generated")).not.toBeInTheDocument());
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(new Set(api.fetchDriverReport.mock.calls.map(([initials]) => initials))).toEqual(new Set(["RF"]));
      expect(within(preview).getByText("All drivers (3)")).toBeInTheDocument();
      expect(within(preview).queryByText("Report partially generated")).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Download PDF" })).toBeEnabled();
    });

    it("cancelling a retry returns to the partial report it started from", async () => {
      const held = gate(); let fail = true;
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => {
        if (initials === "RF") { if (fail) throw new Error("Server busy"); await held.wait; }
        return sampleDriverReport(initials, query);
      });
      renderModal();
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByText("Report partially generated");
      fail = false;
      fireEvent.click(screen.getByRole("button", { name: "Retry failed drivers" }));
      await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent("Retrying failed drivers — 0 of 1 completed"));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel generation" }));
      expect(await screen.findByText("Report partially generated")).toBeInTheDocument();
      await act(async () => { held.open(); });
      expect(screen.getByText("Report partially generated")).toBeInTheDocument();
    });

    it("discards a partial report and shows the form again", async () => {
      api.fetchDriverReport.mockImplementation((initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query));
      renderModal();
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByText("Report partially generated");
      fireEvent.click(screen.getByRole("button", { name: "Discard partial report" }));
      expect(screen.queryByRole("region", { name: "Report preview" })).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
    });

    it("shows real progress counts while several drivers load", async () => {
      const held = gate();
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => { if (initials === "RF") await held.wait; return sampleDriverReport(initials, query); });
      renderModal();
      setCustom("2026-10-05", "2026-10-06");
      generate();
      await waitFor(() => expect(within(dialog()).getByRole("status")).toHaveTextContent(/Loading driver reports — 2 of 3 completed/));
      await act(async () => { held.open(); });
      await screen.findByRole("region", { name: "Report preview" });
    });
  });

  describe("driver list", () => {
    it("blocks All drivers when the list failed, explains it, and loads after Retry", async () => {
      roster.current = { isLoading: false, isError: true, isFetching: false, options: [], refetch: roster.refetch };
      const view = renderModal();
      expect(within(dialog()).getByText("Couldn't load drivers")).toBeInTheDocument();
      expect(within(dialog()).getByText(/Generate is off for All drivers until it loads/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
      setCustom("2026-10-05", "2026-10-11");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Retry drivers" }));
      expect(roster.refetch).toHaveBeenCalledTimes(1);
      roster.current = loaded();
      view.rerender(tree(true));
      expect(within(dialog()).queryByText("Couldn't load drivers")).not.toBeInTheDocument();
      expect(within(dialog()).getByText(/All drivers \(3\)/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
      expect(api.fetchDriverReport).not.toHaveBeenCalled();
    });

    it("tells a genuinely empty roster apart from a failure", () => {
      roster.current = { isLoading: false, isError: false, isFetching: false, options: [], refetch: roster.refetch };
      renderModal();
      expect(within(dialog()).getByText("No drivers on the roster")).toBeInTheDocument();
      expect(within(dialog()).queryByText("Couldn't load drivers")).not.toBeInTheDocument();
      expect(within(dialog()).queryByRole("button", { name: "Retry drivers" })).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
      expect(api.fetchDriverReport).not.toHaveBeenCalled();
    });

    it("keeps a pre-chosen driver usable when the list failed to load", async () => {
      roster.current = { isLoading: false, isError: true, isFetching: false, options: [], refetch: roster.refetch };
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-06");
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
    });
  });

  describe("dates from the Overview", () => {
    it("keeps a range over 93 days as given, explains it, and offers an explicit shorter one", () => {
      renderModal({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T23:59:59.999Z" });
      expect(within(dialog()).getByRole("radio", { name: "Custom range" })).toBeChecked();
      expect(within(dialog()).getByLabelText("From date")).toHaveValue("2026-01-01");
      expect(within(dialog()).getByLabelText("To date")).toHaveValue("2026-12-31");
      expect(within(dialog()).getByRole("alert")).toHaveTextContent(/cover 365 days/);
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
      fireEvent.click(within(dialog()).getByRole("button", { name: /Use the last 93 days up to 2026-12-31/ }));
      expect(within(dialog()).getByLabelText("From date")).toHaveValue("2026-09-30");
      expect(within(dialog()).getByLabelText("To date")).toHaveValue("2026-12-31");
      expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeEnabled();
    });

    it("keeps a one-sided range and asks for the missing date instead of using Last week", () => {
      renderModal({ from: "2026-10-05T23:00:00.000Z" });
      expect(within(dialog()).getByRole("radio", { name: "Custom range" })).toBeChecked();
      expect(within(dialog()).getByLabelText("From date")).toHaveValue("2026-10-06");
      expect(within(dialog()).getByLabelText("To date")).toHaveValue("");
      expect(within(dialog()).getByRole("alert")).toHaveTextContent("Choose an end date.");
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeDisabled();
    });

    it("uses Last week only when no date was given", () => {
      renderModal({ drivers: ["KA"] });
      expect(within(dialog()).getByRole("radio", { name: "Last week" })).toBeChecked();
    });
  });

  describe("driver choice per report type", () => {
    it("keeps each type's own choice, shows what will be covered, and never cuts a multi-driver choice silently", () => {
      renderModal();
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Choose drivers" }));
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Aragao/ }));
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Rafael/ }));
      expect(within(dialog()).getByText(/This report will cover:/)).toHaveTextContent("Aragao (AR), Rafael (RF)");
      fireEvent.click(within(dialog()).getByRole("radio", { name: /Driver breakdown/ }));
      expect(within(dialog()).getByLabelText("Driver")).toHaveValue("");
      expect(within(dialog()).getByText(/This report will cover:/)).toHaveTextContent("No driver chosen yet");
      expect(within(dialog()).getByText(/Your 2-driver choice is kept for the Driver job report/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Download PDF" })).toBeDisabled();
      fireEvent.click(within(dialog()).getByRole("radio", { name: /Jobs list/ }));
      expect(within(dialog()).getByText(/This report will cover:/)).toHaveTextContent("All drivers (chosen by the server)");
      fireEvent.click(within(dialog()).getByRole("radio", { name: /Driver job report/ }));
      expect(within(dialog()).getByRole("checkbox", { name: /Aragao/ })).toBeChecked();
      expect(within(dialog()).getByRole("checkbox", { name: /Rafael/ })).toBeChecked();
      expect(within(dialog()).getByRole("checkbox", { name: /Caio/ })).not.toBeChecked();
    });

    it("sends the Jobs list request for exactly the driver shown", async () => {
      renderModal({ drivers: ["KA"] });
      fireEvent.click(within(dialog()).getByRole("radio", { name: /Jobs list/ }));
      expect(within(dialog()).getByText(/This report will cover:/)).toHaveTextContent("Caio (KA)");
    });
  });

  describe("inactive drivers", () => {
    const withInactive = () => ({ isLoading: false, isError: false, isFetching: false, refetch: roster.refetch, options: [...OPTIONS, { initials: "OL", fullName: "Olga", active: false }] });

    it("includes inactive drivers by default, says so, and requests them", async () => {
      roster.current = withInactive();
      renderModal();
      setCustom("2026-10-05", "2026-10-06");
      expect(within(dialog()).getByText(/All drivers \(4, including 1 inactive\)/)).toBeInTheDocument();
      generate();
      await screen.findByRole("region", { name: "Report preview" });
      expect(new Set(api.fetchDriverReport.mock.calls.map(([initials]) => initials))).toEqual(new Set(["AR", "KA", "RF", "OL"]));
    });

    it("leaves them out only when the user turns them off, and the report names them", async () => {
      roster.current = withInactive();
      renderModal();
      setCustom("2026-10-05", "2026-10-06");
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Include inactive drivers \(1\)/ }));
      expect(within(dialog()).getByText(/All drivers \(3, 1 inactive left out\)/)).toBeInTheDocument();
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(api.fetchDriverReport.mock.calls.some(([initials]) => initials === "OL")).toBe(false);
      expect(within(preview).getByText(/Not requested \(left out by choice\): OL/)).toBeInTheDocument();
    });
  });

  describe("workspace", () => {
    it("shows an inviting empty preview before anything is generated, and nothing is generated yet", () => {
      renderModal({ drivers: ["KA"] });
      expect(within(dialog()).getByText("Your report preview will appear here.")).toBeInTheDocument();
      expect(within(dialog()).getByText("Not generated yet")).toBeInTheDocument();
      expect(within(dialog()).getByText(/select Generate Preview/)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Report preview" })).not.toBeInTheDocument();
      expect(api.fetchDriverReport).not.toHaveBeenCalled();
    });

    it("on success reveals the preview, moves focus to it, scrolls it into view and announces it", async () => {
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText("Complete")).toBeInTheDocument();
      expect(within(preview).getByRole("heading", { name: "Driver Job Report" })).toHaveFocus();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      expect(dialog().querySelector("[aria-live=polite]")?.textContent).toMatch(/Report ready: 36 jobs for Caio \(KA\)/);
      // The primary action changed from Generate to a specific download, and Print is offered separately.
      expect(within(dialog()).queryByRole("button", { name: "Generate Preview" })).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Print report" })).toBeInTheDocument();
    });

    it("shows the report totals, a short job table and says the file has every job", async () => {
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      for (const label of ["Jobs", "Completed", "Final charges", "Working time"]) expect(within(preview).getByText(label, { selector: "dt" })).toBeInTheDocument();
      expect(within(preview).getAllByText("36", { selector: "dd" })).toHaveLength(2);   // Jobs and Completed
      expect(within(preview).getAllByRole("row")).toHaveLength(1 + 8);
      expect(within(preview).getByText("Showing the first 8 of 36 jobs. Every job is in the downloaded file.")).toBeInTheDocument();
    });

    it("never shows an unavailable figure as a value: Not available, a Partial badge, and no success badge", async () => {
      api.fetchDriverReport.mockImplementation((initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("busy")) : sampleDriverReport(initials, query));
      renderModal();
      setCustom("2026-10-05", "2026-10-11");
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText("Partial")).toBeInTheDocument();
      expect(within(preview).queryByText("Complete")).not.toBeInTheDocument();
      const finalCharges = within(preview).getByText("Final charges", { selector: "dt" }).parentElement!;
      expect(finalCharges).toHaveTextContent("Not available");
      expect(finalCharges).toHaveTextContent(/Known subtotal £/);
      expect(finalCharges).not.toHaveTextContent("£0.00");
    });

    it("treats a period with no jobs as a valid, complete empty result and shows the filters used", async () => {
      renderModal({ drivers: ["RF"] });
      setCustom("2026-09-01", "2026-09-02");
      generate();
      const preview = await screen.findByRole("region", { name: "Report preview" });
      expect(within(preview).getByText("Complete, no jobs")).toBeInTheDocument();
      expect(within(preview).getByText("No jobs found for the selected period.")).toBeInTheDocument();
      expect(within(preview).getByText(/1 Sep 2026 to 2 Sep 2026, London time/)).toBeInTheDocument();
      expect(within(preview).queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows a real progress bar and a per-driver list while loading", async () => {
      const held = gate();
      api.fetchDriverReport.mockImplementation(async (initials: string, query: Record<string, string | number>) => { if (initials === "RF") await held.wait; return sampleDriverReport(initials, query); });
      renderModal();
      setCustom("2026-10-05", "2026-10-06");
      generate();
      const bar = await screen.findByRole("progressbar", { name: "Report progress" });
      await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "2"));
      expect(bar).toHaveAttribute("aria-valuemax", "3");
      const list = within(dialog()).getByRole("list", { name: "Driver progress" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      expect(within(list).getByText("Rafael").closest("li")).toHaveTextContent("Loading");
      expect(within(list).getByText("Caio").closest("li")).toHaveTextContent("Loaded");
      await act(async () => { held.open(); });
      await screen.findByRole("region", { name: "Report preview" });
    });

    it("says why the preview was cleared after an edit, and after a cancelled run", async () => {
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByRole("region", { name: "Report preview" });
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Today" }));
      expect(within(dialog()).getByText("Options changed")).toBeInTheDocument();
      expect(within(dialog()).getByText(/The earlier preview no longer matches the form/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Generate Preview" })).toBeInTheDocument();
    });

    it("explains a range kept from the Overview and the missing-date and over-limit cases in the form", () => {
      renderModal({ from: "2026-10-05T23:00:00.000Z", to: "2026-10-11T22:59:59.999Z" });
      expect(within(dialog()).getByText(/Taken from the Overview filters/)).toBeInTheDocument();
      fireEvent.change(within(dialog()).getByLabelText("To date"), { target: { value: "" } });
      expect(within(dialog()).queryByText(/Taken from the Overview filters/)).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("alert")).toHaveTextContent("Choose an end date.");
      expect(within(dialog()).getByText("Not ready yet")).toBeInTheDocument();
    });

    it("describes each file format, marks the selected one, and gives a specific download label", () => {
      renderModal({ drivers: ["KA"] });
      const excel = within(dialog()).getByRole("radio", { name: "Excel (.xlsx)" });
      expect(excel).toHaveAccessibleDescription("Structured spreadsheet for analysis.");
      expect(within(dialog()).getByRole("radio", { name: "Word (.docx)" })).toHaveAccessibleDescription("Editable report document.");
      expect(within(dialog()).getByRole("radio", { name: "PDF" })).toBeChecked();
      fireEvent.click(excel);
      expect(excel).toBeChecked();
    });

    it("offers a direct, specific download (and no preview) for the server's reports", () => {
      renderModal({ drivers: ["KA"] });
      fireEvent.click(within(dialog()).getByRole("radio", { name: /Jobs list/ }));
      expect(within(dialog()).getByText(/built by the server and downloads directly, so there is no preview/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Download CSV (.csv)" })).toBeEnabled();
      expect(within(dialog()).queryByRole("button", { name: "Generate Preview" })).not.toBeInTheDocument();
    });

    it("narrows a long driver list with search without losing the selection", () => {
      renderModal();
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Choose drivers" }));
      fireEvent.click(within(dialog()).getByRole("checkbox", { name: /Aragao/ }));
      fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Search drivers" }), { target: { value: "raf" } });
      expect(within(dialog()).queryByRole("checkbox", { name: /Aragao/ })).not.toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Select shown" }));
      fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Search drivers" }), { target: { value: "" } });
      expect(within(dialog()).getByText("2 of 3 selected")).toBeInTheDocument();
      expect(within(dialog()).getByRole("checkbox", { name: /Aragao/ })).toBeChecked();
      fireEvent.change(within(dialog()).getByRole("searchbox", { name: "Search drivers" }), { target: { value: "zzz" } });
      expect(within(dialog()).getByText('No driver matches "zzz".')).toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Clear" }));
      expect(within(dialog()).getByText("0 of 3 selected")).toBeInTheDocument();
    });

    it("downloads the PDF as a file with the report's own name, once, and prints through the separate action", async () => {
      const names: string[] = [];
      URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByRole("region", { name: "Report preview" });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Download PDF" }));
      expect(names).toEqual(["tmv-driver-jobs-KA-2026-10-05-to-2026-10-11.pdf"]);
      expect(print.printDocument).not.toHaveBeenCalled();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Print report" }));
      await waitFor(() => expect(print.printDocument).toHaveBeenCalledTimes(1));
      expect(print.printDocument.mock.calls[0][0]).toMatchObject({ title: "tmv-driver-jobs-KA-2026-10-05-to-2026-10-11" });
      click.mockRestore();
    });

    it("shows a print failure instead of leaving the dialog in a printing state", async () => {
      print.printDocument.mockRejectedValue(new Error("blocked by the browser"));
      renderModal({ drivers: ["KA"] });
      setCustom("2026-10-05", "2026-10-11");
      generate();
      await screen.findByRole("region", { name: "Report preview" });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Print report" }));
      expect(await screen.findByText(/Printing failed: blocked by the browser/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: "Print report" })).toBeEnabled();
    });
  });
});
