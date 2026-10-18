import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvidencePage } from "./EvidencePage";
import { Pagination } from "../components/ds";

const api = vi.hoisted(() => ({ fetchScenarios: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), fetchScenarios: api.fetchScenarios }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => ({ options: [{ initials: "KA", fullName: "Caio" }], isLoading: false }) }));

const record = (patch: Record<string, unknown>) => ({ id: "r1", kind: "parking", timestamp: "2026-10-13T09:00:00Z", jobId: "TMV-9", clientName: "Alex Sample",
  driverName: "Sam Driver", driverInitials: "SD", address: "1 Example Street", photos: [], signature: null, ...patch });
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EvidencePage /></QueryClientProvider>);
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  api.fetchScenarios.mockReset().mockResolvedValue({ kind: "parking", items: [record({}), record({ id: "r2", clientName: "Blake Example", jobId: "TMV-10", signature: { fileId: "s", thumbUrl: "/sig.png" } })], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 } });
  window.history.replaceState({}, "", "/admin?section=evidence");
});

describe("Pagination", () => {
  it("never shows an impossible range like 1–0 of 0", () => {
    const { rerender } = render(<Pagination page={1} pageSize={25} total={0} onPage={vi.fn()} />);
    expect(screen.getByText("0 records")).toBeInTheDocument();
    expect(screen.queryByText(/1–0/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    rerender(<Pagination page={2} pageSize={25} total={30} onPage={vi.fn()} />);
    expect(screen.getByText("26–30 of 30 records")).toBeInTheDocument();
  });
});

describe("EvidencePage", () => {
  it("defaults to Parking Liability with the requested columns, selection and signature states", async () => {
    api.fetchScenarios.mockResolvedValue({ kind: "parking", items: [
      record({ address: "", rawRecord: { reported_at: "Pickup — 10 High Street" } }),
      record({ id: "r2", clientName: "Blake Example", address: "", signature: { fileId: "s", thumbUrl: "/sig.png" } })
    ], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 } });
    renderPage();
    const table = await screen.findByRole("table");
    expect(screen.getByRole("tab", { name: "Parking Liability" })).toHaveAttribute("aria-selected", "true");
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["", "#", "Driver", "Date Submitted", "Address", "Full Client Name", "Parking Restriction Photos", "Signature"]);
    expect(within(table).getAllByText("13/10/26 · 10:00")).toHaveLength(2);
    expect(within(table).getByText("10 High Street")).toBeInTheDocument();
    expect(within(table).getAllByText("Address not properly recorded")).toHaveLength(1);
    expect(within(table).getByRole("columnheader", { name: "Signature" })).toBeInTheDocument();
    expect(within(table).getByText("Missing")).toBeInTheDocument();
    expect(within(table).getByText("Signed")).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select all parking records on this page" }));
    expect(within(table).getByRole("checkbox", { name: "Select parking record r1" })).toBeChecked();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select parking record r1" }));
    expect(within(table).getByRole("checkbox", { name: "Select parking record r1" })).not.toBeChecked();
  });

  it("says the text filter applies to this page only", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter the records on this page" }), { target: { value: "blake" } });
    expect(await screen.findByText("1 of 2 on this page")).toBeInTheDocument();
  });

  it("keeps the evidence type in the URL and asks the server for that type", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("tab", { name: "Check In" }));
    expect(params().get("kind")).toBe("checkin");
    expect(api.fetchScenarios.mock.calls.at(-1)?.[0]).toBe("checkin");
  });

  it("shows a real empty state with zero records", async () => {
    api.fetchScenarios.mockResolvedValue({ kind: "parking", items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    renderPage();
    expect(await screen.findByText(/No parking/i)).toBeInTheDocument();
    expect(screen.getAllByText("0 records")).toHaveLength(1);
  });

  it("opens the centred record, not the job drawer, from the Job ID", async () => {
    renderPage();
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: /record for job TMV-9$/ }));
    expect(params().get("record")).toBe("r1");
    expect(params().get("job")).toBeNull();
    expect(await screen.findByTestId("evidence-document")).toBeInTheDocument();
  });

  it.each(["checkin", "checkout", "parking", "liability"])("opens a %s record from a deep link or search result in the centred preview", async kind => {
    window.history.replaceState({}, "", `/admin?section=evidence&kind=${kind}&record=r1`);
    api.fetchScenarios.mockResolvedValue({ kind, items: [record({ kind })], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    renderPage();
    const dialog = await screen.findByTestId("evidence-document");
    expect(within(dialog).getByRole("heading", { name: "Alex Sample" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(params().get("job")).toBeNull();
  });

  it("opens the linked job only from the explicit action, closing the record first", async () => {
    window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Open job" }));
    expect(params().get("job")).toBe("TMV-9");
    expect(params().get("record")).toBeNull();
  });

  it("keeps the live Liability Report columns", async () => {
    window.history.replaceState({}, "", "/admin?section=evidence&kind=liability");
    api.fetchScenarios.mockResolvedValue({ kind: "liability", items: [record({ kind: "liability", damageCategories: "Wall scuff, Door frame" })], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Timestamp", "Job ID", "Driver", "Damage Report #", "Client Name", "Pictures", "Sign here.", "Docs"]);
    expect(within(table).getByText("Wall scuff")).toBeInTheDocument();
  });

  it.each(["checkin", "checkout", "parking", "liability"])("sends the driver filter for %s", async kind => {
    window.history.replaceState({}, "", `/admin?section=evidence&kind=${kind}`);
    renderPage();
    fireEvent.change(await screen.findByRole("combobox", { name: "Driver" }), { target: { value: "KA" } });
    await vi.waitFor(() => expect(api.fetchScenarios).toHaveBeenLastCalledWith(kind, 1, "KA", expect.any(String), expect.any(String)));
    expect(params().get("driver")).toBe("KA");
  });

  it("shows the parking notice, and no other scenario's wording, in the record preview", async () => {
    window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
    renderPage();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Penalty Charge Liability Notice")).toBeInTheDocument();
    expect(within(dialog).getByText(/^\(PCN\) In the event a fine is received/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Client declaration")).not.toBeInTheDocument();
  });

  describe("centred document modal", () => {
    it("opens a centred dialog, never a side drawer, and closes with Escape", async () => {
      window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
      renderPage();
      const dialog = await screen.findByRole("dialog", { name: "Alex Sample" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog.className).toContain("sm:max-w-[min(1060px,100%)]");
      expect(dialog.parentElement!.className).toContain("justify-center");
      expect(within(dialog).getByText("Record details")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      await vi.waitFor(() => expect(params().get("record") || "").toBe(""));
    });

    it("shows the summary with honest states and the exact declaration text", async () => {
      window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
      renderPage();
      const dialog = await screen.findByRole("dialog");
      const summary = within(dialog).getByLabelText("Record summary");
      expect(summary).toHaveTextContent("Alex Sample");
      expect(summary).toHaveTextContent("TMV-9");
      expect(summary).toHaveTextContent("Not signed");
      expect(within(dialog).getByText("No photos attached.")).toBeInTheDocument();
      expect(within(dialog).getByText(/version stored at the moment of signing is not available/)).toBeInTheDocument();
      expect(within(dialog).getByText(/fines typically start at £60 and can go up to £180/)).toBeInTheDocument();
    });

    it("switches to the real PDF preview with page and zoom controls, and back", async () => {
      window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
      renderPage();
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Preview PDF" })[0]);
      expect(dialog).toHaveClass("h-full", "w-full", "max-w-none", "rounded-none");
      expect(dialog).not.toHaveClass("sm:max-w-[min(1060px,100%)]");
      expect(within(dialog).queryByLabelText("Record summary")).not.toBeInTheDocument();
      const toolbar = within(dialog).getByRole("toolbar", { name: "PDF controls" });
      expect(toolbar).toHaveTextContent(/Page 1 of/);
      fireEvent.click(within(toolbar).getByRole("button", { name: "Zoom in" }));
      expect(toolbar).toHaveTextContent("125%");
      fireEvent.click(within(toolbar).getByRole("button", { name: "Fit to width" }));
      expect(toolbar).toHaveTextContent("100%");
      expect(dialog.querySelector(".report-preview-page")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Back to Form" }));
      expect(within(dialog).queryByRole("toolbar", { name: "PDF controls" })).not.toBeInTheDocument();
      expect(dialog).toHaveClass("sm:max-w-[min(1060px,100%)]");
    });

    it("moves to the next record and starts it on its own details", async () => {
      window.history.replaceState({}, "", "/admin?section=evidence&kind=parking&record=r1");
      renderPage();
      const dialog = await screen.findByRole("dialog", { name: "Alex Sample" });
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Preview PDF" })[0]);
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Next record" })[0]);
      const next = await screen.findByRole("dialog", { name: "Blake Example" });
      expect(within(next).queryByRole("toolbar", { name: "PDF controls" })).not.toBeInTheDocument();
      expect(within(next).getByLabelText("Record summary")).toHaveTextContent("Signed");
      expect(within(next).getAllByRole("button", { name: "Previous record" })[0]).toBeEnabled();
    });
  });
});
