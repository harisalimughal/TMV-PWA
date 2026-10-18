import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityMessage, ActivityPage } from "../../../../lib/activity";

const adminFetch = vi.fn();
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: (...args: unknown[]) => adminFetch(...args) }));

import { useJobThread } from "./useActivity";

const entry = (id: string, at = "2026-10-16T09:00:00Z"): ActivityMessage => ({ id, jobId: "J1", type: "legacy.entry", kind: "operational", title: id, occurredAt: at, recordedAt: at } as unknown as ActivityMessage);
const page = (items: ActivityMessage[], extra: Partial<ActivityPage> = {}): ActivityPage => ({ items, nextCursor: items.at(-1)?.id, serverTime: "2026-10-16T09:10:00Z", ...extra });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, message = "x") => ({ ok: false, status, json: async () => ({ error: { message } }) });

describe("useJobThread", () => {
  beforeEach(() => adminFetch.mockReset());

  it("loads the latest page then polls with the newest cursor and never duplicates", async () => {
    adminFetch
      .mockResolvedValueOnce(ok(page([entry("a"), entry("b", "2026-10-16T09:01:00Z")])))
      .mockResolvedValue(ok(page([entry("b", "2026-10-16T09:01:00Z"), entry("c", "2026-10-16T09:02:00Z")])));
    const { result } = renderHook(() => useJobThread("J1", 20));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.entries.map(e => e.id)).toEqual(["a", "b", "c"]));
    expect(String(adminFetch.mock.calls[1][0])).toContain("after=b");
  });

  it("reports unavailable when the server lacks the endpoint", async () => {
    adminFetch.mockResolvedValue(fail(501, "Not implemented"));
    const { result } = renderHook(() => useJobThread("J1", 20));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("reports an error for a server failure and recovers on retry", async () => {
    adminFetch.mockResolvedValueOnce(fail(500, "Server error")).mockResolvedValue(ok(page([entry("a")])));
    const { result } = renderHook(() => useJobThread("J1", 10_000));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Server error");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("flags reconnecting when a poll fails and clears it on recovery", async () => {
    let calls = 0;
    adminFetch.mockImplementation(async () => (++calls === 1 ? ok(page([entry("a")])) : calls < 5 ? fail(503) : ok(page([]))));
    const { result } = renderHook(() => useJobThread("J1", 30));
    await waitFor(() => expect(result.current.reconnecting).toBe(true));
    await waitFor(() => expect(result.current.reconnecting).toBe(false));
    expect(result.current.entries).toHaveLength(1);
  });

  it("appends a confirmed sent message once", async () => {
    adminFetch.mockResolvedValue(ok(page([entry("a")])));
    const { result } = renderHook(() => useJobThread("J1", 10_000));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.append(entry("m1", "2026-10-16T09:05:00Z")); result.current.append(entry("m1", "2026-10-16T09:05:00Z")); });
    expect(result.current.entries.map(e => e.id)).toEqual(["a", "m1"]);
  });
});
