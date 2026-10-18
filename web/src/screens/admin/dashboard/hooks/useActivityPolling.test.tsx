import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adminFetch = vi.fn();
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: (...args: unknown[]) => adminFetch(...args) }));

import { useActivityUnread } from "./useActivity";

const wrap = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe("useActivityUnread polling", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); adminFetch.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("stops asking once the server says it does not provide activity (501)", async () => {
    adminFetch.mockResolvedValue(reply(501, { error: { message: "Not implemented" } }));
    const { result } = renderHook(() => useActivityUnread(), { wrapper: wrap });
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); window.dispatchEvent(new Event("focus")); });
    expect(adminFetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(0);
  });

  it("also stops on 404", async () => {
    adminFetch.mockResolvedValue(reply(404, { error: { message: "Not found" } }));
    renderHook(() => useActivityUnread(), { wrapper: wrap });
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(adminFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps polling when the server does provide it", async () => {
    adminFetch.mockResolvedValue(reply(200, { total: 3, serverTime: "2026-10-16T10:00:00Z" }));
    const { result } = renderHook(() => useActivityUnread(), { wrapper: wrap });
    await waitFor(() => expect(result.current).toBe(3));
    await act(async () => { await vi.advanceTimersByTimeAsync(95_000); });
    expect(adminFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps polling after an ordinary server error (500), which may be temporary", async () => {
    adminFetch.mockResolvedValue(reply(500, { error: { message: "Server error" } }));
    renderHook(() => useActivityUnread(), { wrapper: wrap });
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(adminFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
