import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { adminReadHeaders, INCLUDE_MA_KEY, readIncludeMA, scopedAdminUrl, setIncludeMA } from "./adminDriverScope";
import { IncludeMaToggle } from "../screens/admin/dashboard/components/IncludeMaToggle";
import { cancelPendingNavigation, confirmPendingNavigation, setUnsaved } from "../screens/admin/dashboard/utils/unsavedChanges";
import { handleAdmin } from "../mocks/admin";

beforeEach(() => { localStorage.clear(); setUnsaved("test-editor", false); cancelPendingNavigation(); });
describe("MA inclusion preference", () => {
  it("defaults off, persists explicitly, and leaves unrelated drivers and data untouched", () => {
    expect(readIncludeMA()).toBe(false); expect(adminReadHeaders()["X-TMV-Include-MA"]).toBe("true");
    setIncludeMA(true); expect(localStorage.getItem(INCLUDE_MA_KEY)).toBe("1"); expect(readIncludeMA()).toBe(true);
    expect(scopedAdminUrl("/api/admin/jobs/export.csv?from=2026-10-01")).toBe("/api/admin/jobs/export.csv?from=2026-10-01&includeMA=1");
    setIncludeMA(false); expect(readIncludeMA()).toBe(false);
    expect(scopedAdminUrl("/api/admin/van/records/export.csv")).toContain("includeMA=1");
    expect(adminReadHeaders({ Accept: "text/csv" }).accept).toBe("text/csv");
  });
  it("changes the Overview preference without clearing other pages' cached data", async () => {
    const client = new QueryClient(); client.setQueryData(["range_jobs"], { amount: 89898888800 });
    render(<QueryClientProvider client={client}><IncludeMaToggle /></QueryClientProvider>);
    const toggle = screen.getByRole("switch", { name: "Include MA driver data" });
    expect(toggle).not.toBeChecked(); fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(client.getQueryData(["range_jobs"])).toEqual({ amount: 89898888800 });
    fireEvent.click(toggle); await waitFor(() => expect(toggle).not.toBeChecked());
  });
  it("does not discard unsaved work without the existing navigation confirmation", async () => {
    setUnsaved("test-editor", true);
    render(<QueryClientProvider client={new QueryClient()}><IncludeMaToggle /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("switch")); expect(readIncludeMA()).toBe(false);
    cancelPendingNavigation(); expect(readIncludeMA()).toBe(false);
    fireEvent.click(screen.getByRole("switch")); await act(async () => confirmPendingNavigation());
    await waitFor(() => expect(readIncludeMA()).toBe(true));
  });
  it("keeps preview lists, totals, pagination and CSV exports consistent with the same selection", async () => {
    const excluded = (await handleAdmin("GET", "/api/admin/jobs", "?includeMA=0&pageSize=1000"))!.body as any;
    const included = (await handleAdmin("GET", "/api/admin/jobs", "?includeMA=1&pageSize=1000"))!.body as any;
    expect(included.items.some((j: any) => j.driverInitials === "MA")).toBe(true);
    expect(excluded.items.some((j: any) => j.driverInitials === "MA")).toBe(false);
    expect(excluded.pagination.total).toBe(included.items.filter((j: any) => j.driverInitials !== "MA").length);
    const roster = (await handleAdmin("GET", "/api/admin/drivers/summary", "?includeMA=0"))!.body as any;
    expect(roster.drivers.some((d: any) => d.initials === "MA")).toBe(false);
    const csv = (await handleAdmin("GET", "/api/admin/jobs/export.csv", "?includeMA=0"))!.body as string;
    for (const job of included.items.filter((j: any) => j.driverInitials === "MA")) expect(csv).not.toContain(job.jobId);
  });
});
