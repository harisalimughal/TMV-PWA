import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAdmin } from "../../../../mocks/admin";
import { resetActivity } from "../../../../mocks/activity";
import { ActivityPage } from "./ActivityPage";

const mocks = vi.hoisted(() => ({ adminFetch: vi.fn(), fetchDrivers: vi.fn() }));
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: mocks.adminFetch }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: mocks.fetchDrivers }));

/** Backs adminFetch with the dev/demo mock API so these tests exercise the real client and screens. */
const demoServer = async (input: string, init?: RequestInit) => {
  const url = new URL(input, "http://localhost");
  const res = (await handleAdmin(init?.method ?? "GET", url.pathname, url.search, typeof init?.body === "string" ? init.body : undefined))!;
  return { ok: res.status < 400, status: res.status, json: async () => res.body };
};

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ActivityPage /></QueryClientProvider>);

beforeEach(() => {
  resetActivity();
  mocks.adminFetch.mockReset().mockImplementation(demoServer);
  mocks.fetchDrivers.mockReset().mockResolvedValue([{ initials: "KA", fullName: "Caio", active: true }, { initials: "TI", fullName: "Tiago", active: true }]);
  window.history.replaceState({}, "", "/admin?section=activity");
});

describe("Activity page", () => {
  it("lists conversations with driver, job, status and unread, and shows a prompt until one is chosen", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(2);
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
    expect(within(list).getAllByText(/unread/).length).toBeGreaterThan(0);
  });

  it("opens a conversation from the list, keeps it in the URL and offers Notify Driver for that job only", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    const link = await screen.findByRole("link", { name: "Notify the driver assigned to this job" });
    expect(new URLSearchParams(window.location.search).get("conversation")).toBeTruthy();
    const href = new URLSearchParams(link.getAttribute("href")!.replace(/^\?/, ""));
    expect(href.get("section")).toBe("alerts");
    expect(href.get("compose")).toBe("driver");
    expect(href.get("msgDriver")).toBeTruthy();
    expect(href.get("msgJob")).toBe(new URLSearchParams(window.location.search).get("conversation"));
    expect(await screen.findByRole("region", { name: /Conversation for job/ })).toBeInTheDocument();
  });

  it("targets each conversation's own driver and job when switching, never the previous one", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    const rows = within(list).getAllByRole("button");
    const seen: Array<[string | null, string | null]> = [];
    for (const row of [rows[0], rows[1], rows[0]]) {
      fireEvent.click(row);
      const link = await screen.findByRole("link", { name: "Notify the driver assigned to this job" });
      await waitFor(() => expect(new URLSearchParams(link.getAttribute("href")!.replace(/^\?/, "")).get("msgJob")).toBe(new URLSearchParams(window.location.search).get("conversation")));
      const href = new URLSearchParams(link.getAttribute("href")!.replace(/^\?/, ""));
      seen.push([href.get("msgDriver"), href.get("msgJob")]);
      expect(screen.getByText("Notify Driver")).toBeInTheDocument();
    }
    expect(seen[0]![1]).not.toBe(seen[1]![1]);
    expect(seen[2]).toEqual(seen[0]);
    expect(screen.queryByText(/Message driver/i)).not.toBeInTheDocument();
  });

  it("marks a conversation read once it is on screen", async () => {
    window.history.replaceState({}, "", "/admin?section=activity&unread=1");
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    await waitFor(() => expect(mocks.adminFetch.mock.calls.some(([path]) => String(path).endsWith("/activity/read"))).toBe(true));
  });

  it("filters by driver and says so when nothing matches", async () => {
    window.history.replaceState({}, "", "/admin?section=activity&q=zzzz-no-such-job");
    renderPage();
    expect(await screen.findByText("No conversations match")).toBeInTheDocument();
  });

  it("says activity is not available, without sample data, when the server lacks the endpoints", async () => {
    mocks.adminFetch.mockImplementation(async () => ({ ok: false, status: 501, json: async () => ({ error: { message: "Not implemented" } }) }));
    renderPage();
    expect(await screen.findByText("Activity is not available on this server")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Conversations" })).not.toBeInTheDocument();
  });

  it("shows a retryable error for a server failure", async () => {
    mocks.adminFetch.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "Server error" } }) }));
    renderPage();
    expect(await screen.findByText("Conversations could not be loaded", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
  });
});

describe("Activity page interactions", () => {
  it("moves between conversations with the arrow keys, j and k, Home and End", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    const rows = within(list).getAllByRole("button");
    rows[0].focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(list, { key: "j" });
    expect(rows[2]).toHaveFocus();
    fireEvent.keyDown(list, { key: "k" });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(list, { key: "End" });
    expect(rows[rows.length - 1]).toHaveFocus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(rows[rows.length - 1]).toHaveFocus();
    fireEvent.keyDown(list, { key: "Home" });
    expect(rows[0]).toHaveFocus();
  });

  it("shows how many conversations and how many are unread, and clears filters in one click", async () => {
    window.history.replaceState({}, "", "/admin?section=activity&unread=1");
    renderPage();
    expect(await screen.findByText(/conversations?, \d+ unread/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(window.location.search).not.toContain("unread"));
    expect(screen.queryByRole("button", { name: /Clear filters/ })).not.toBeInTheDocument();
  });

  it("closes the open chat with Escape and focuses search with /", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    const chat = await screen.findByRole("region", { name: /Conversation for job/ });
    fireEvent.keyDown(chat, { key: "Escape" });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("conversation")).toBeNull());
    fireEvent.keyDown(screen.getByRole("list", { name: "Conversations" }), { key: "/" });
    expect(screen.getByLabelText("Search conversations")).toHaveFocus();
  });

  it("copies the job number from the chat header", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    const list = await screen.findByRole("list", { name: "Conversations" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Copy job number/ }));
    expect(writeText).toHaveBeenCalledWith(new URLSearchParams(window.location.search).get("conversation"));
    expect(await screen.findByRole("button", { name: "Job number copied" })).toBeInTheDocument();
  });
});
