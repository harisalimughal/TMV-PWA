import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "./usePushNotifications";

vi.mock("./platform", () => ({ supportsNotifications: () => true, supportsPush: () => true, getPlatform: () => "desktop" }));
vi.mock("./vapidHelper", () => ({ urlBase64ToUint8Array: () => new Uint8Array([1]) }));

const subscription = { toJSON: () => ({ endpoint: "https://push.example.invalid/device", keys: { auth: "a", p256dh: "k" } }) };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ publicKey: "test-key" }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(subscription) } }) } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("device push subscription", () => {
  it("registers the browser subscription with the backend before reporting success", async () => {
    const { result } = renderHook(() => usePushNotifications());
    let ok = false;
    await act(async () => { ok = await result.current.subscribe(); });
    expect(ok).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST", body: JSON.stringify({ subscription: subscription.toJSON(), platform: "desktop" }) }));
  });

  it("does not report success when server registration fails", async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: url !== "/api/push/subscribe", json: async () => ({ publicKey: "test-key" }) }));
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => { ok = await result.current.subscribe(); });
    expect(ok).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("releases the loading button when a service worker never becomes ready", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { serviceWorker: { ready: new Promise(() => {}) } });
    const { result } = renderHook(() => usePushNotifications());
    let pending: Promise<boolean>;
    await act(async () => { pending = result.current.subscribe(); });
    expect(result.current.isLoading).toBe(true);
    let ok = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); ok = await pending!; });
    expect(ok).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/push/subscribe", expect.anything());
  });
});
