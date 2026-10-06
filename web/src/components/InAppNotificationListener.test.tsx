import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./ui/Toast";
import { InAppNotificationListener } from "./InAppNotificationListener";
import { playPersistentAlertSound, primePersistentAlertSound } from "../lib/alertSound";

const notificationLogMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  dismissNotification: vi.fn()
}));

vi.mock("../lib/alertSound", () => ({
  playPersistentAlertSound: vi.fn(),
  primePersistentAlertSound: vi.fn(),
  playZoneAlertSound: vi.fn()
}));

vi.mock("../lib/pwa/notificationLog", () => notificationLogMocks);

function renderListener() {
  const listeners: Array<(event: MessageEvent) => void> = [];
  const serviceWorker = {
    addEventListener: vi.fn((_type: string, listener: (event: MessageEvent) => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn()
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker
  });

  render(
    <ToastProvider>
      <InAppNotificationListener />
    </ToastProvider>
  );

  return {
    sendPush(payload: Record<string, unknown>) {
      listeners.forEach(listener =>
        listener({
          data: { type: "PUSH_NOTIFICATION_RECEIVED", payload }
        } as MessageEvent)
      );
    }
  };
}

describe("InAppNotificationListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationLogMocks.listNotifications.mockResolvedValue([]);
    notificationLogMocks.dismissNotification.mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {}
    });
  });

  it("primes alert audio on the first driver gesture so later popup sounds can play", () => {
    renderListener();

    window.dispatchEvent(new Event("pointerdown"));

    expect(primePersistentAlertSound).toHaveBeenCalledOnce();
  });

  it("shows admin broadcast messages as persistent top popups until the close button is clicked", async () => {
    const { sendPush } = renderListener();

    sendPush({
      title: "Traffic update",
      body: "Use the north entrance today.",
      data: { kind: "broadcast_message" }
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Traffic update");
    expect(alert).toHaveTextContent("Use the north entrance today.");
    expect(playPersistentAlertSound).toHaveBeenCalledOnce();

    await waitFor(() => expect(screen.queryByRole("status")).not.toHaveTextContent("Traffic update"));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows overdue proof-of-arrival warnings as persistent top popups", async () => {
    const { sendPush } = renderListener();

    sendPush({
      title: "Van loaded photo overdue",
      body: "More than 15 min has passed, you didn't upload van loaded pic. Hurry up.",
      data: { kind: "arrival_proof_overdue" }
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Van loaded photo overdue");
    expect(alert).toHaveTextContent("Hurry up");
    expect(playPersistentAlertSound).toHaveBeenCalledOnce();
  });

  it("restores a background broadcast until its center notice is explicitly closed", async () => {
    notificationLogMocks.listNotifications.mockResolvedValue([
      {
        id: 42,
        title: "Tomorrow's update",
        body: "There are no jobs booked for tomorrow.",
        url: "/?tab=jobs",
        kind: "broadcast_message",
        receivedAt: Date.now(),
        read: true,
        dismissed: false
      }
    ]);

    renderListener();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tomorrow's update");
    expect(alert).toHaveTextContent("There are no jobs booked for tomorrow.");
    expect(playPersistentAlertSound).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(notificationLogMocks.dismissNotification).toHaveBeenCalledWith(42);
  });
});
