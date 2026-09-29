import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./ui/Toast";
import { InAppNotificationListener } from "./InAppNotificationListener";
import { playPersistentAlertSound, primePersistentAlertSound } from "../lib/alertSound";

vi.mock("../lib/alertSound", () => ({
  playPersistentAlertSound: vi.fn(),
  primePersistentAlertSound: vi.fn(),
  playZoneAlertSound: vi.fn()
}));

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
});
