import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDriverOptions, DRIVER_OPTIONS_QUERY_KEY } from "./useDriverOptions";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDriverOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads sorted account-backed drivers from the lightweight roster endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        drivers: [
          { initials: "ZZ", fullName: "Zara Zee", active: false },
          { initials: "UNASSIGNED", fullName: "Unassigned", active: true },
          { initials: "KA", fullName: "Caio Gabriel", active: true },
          { initials: "RF", fullName: "Rafael Cruz", active: true }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDriverOptions(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/drivers",
      expect.objectContaining({ credentials: "same-origin" })
    );
    expect(result.current.options).toEqual([
      { initials: "KA", fullName: "Caio Gabriel", active: true },
      { initials: "RF", fullName: "Rafael Cruz", active: true },
      { initials: "ZZ", fullName: "Zara Zee", active: false }
    ]);
    expect(DRIVER_OPTIONS_QUERY_KEY).toEqual(["admin_driver_options"]);
  });
});
