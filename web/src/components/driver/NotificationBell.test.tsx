import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell";
import { NotificationDetailModal } from "./NotificationDetailModal";
import type { LoggedNotification } from "../../lib/pwa/notificationLog";

const mocks = vi.hoisted(() => ({ markRead: vi.fn(), markAllRead: vi.fn(), items: [] as LoggedNotification[] }));
vi.mock("../../lib/pwa/useNotificationLog", () => ({ useNotificationLog: () => ({ items: mocks.items, unreadCount: mocks.items.filter(item => !item.read).length,
  loading: false, markRead: mocks.markRead, markAllRead: mocks.markAllRead, refresh: vi.fn() }) }));
const notification: LoggedNotification = { id: 42, title: "Booking updated: full collection and delivery instructions for your next assigned job",
  body: "Collection instructions:\nPlease use the rear entrance and contact the customer before arrival.\n\n" + "Keep this complete instruction visible. ".repeat(35) + "Final instruction: bring the trolley.",
  receivedAt: Date.UTC(2026, 9, 10, 9, 30), url: "/?tab=jobs", read: false, kind: "broadcast_message" };

describe("Driver notification details", () => {
  beforeEach(() => {
    mocks.markRead.mockReset().mockResolvedValue(undefined); mocks.markAllRead.mockReset().mockResolvedValue(undefined);
    mocks.items = [{ ...notification }]; window.history.replaceState({}, "", "/driver");
  });
  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("menuitem"));
    return screen.getByRole("dialog", { name: "Notification details" });
  };
  it("opens the full untruncated title and multiline message without leaving the current screen", () => {
    const { container } = render(<NotificationBell showDetails />);
    const before = location.href, dialog = open();
    expect(within(dialog).getByRole("heading", { name: notification.title })).not.toHaveClass("truncate");
    expect(dialog.querySelector("p")?.textContent).toBe(notification.body);
    expect(dialog.querySelector("p")).not.toHaveClass("line-clamp-2");
    expect(dialog.querySelector("time")).toHaveAttribute("datetime", "2026-10-10T09:30:00.000Z");
    expect(mocks.markRead).toHaveBeenCalledWith(42);
    expect(location.href).toBe(before); expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(container).not.toContainElement(dialog);
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Open related page")).not.toBeInTheDocument();
  });
  it("closes on Escape, unlocks scrolling and restores focus to the bell", () => {
    render(<NotificationBell showDetails />); const trigger = screen.getByRole("button", { name: "Notifications, 1 unread" });
    open(); expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(document.body.style.overflow).not.toBe("hidden"); expect(trigger).toHaveFocus();
  });
  it("supports the close button and still opens if local read-state storage fails", async () => {
    mocks.markRead.mockRejectedValueOnce(new Error("Local storage unavailable"));
    render(<NotificationBell showDetails />); open();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps mark-all-read available and does not open a detail modal for that command", () => {
    render(<NotificationBell showDetails />); fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(mocks.markAllRead).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("preserves the default admin click-through behavior", () => {
    mocks.items = [{ ...notification, url: "#legacy-notification" }];
    render(<NotificationBell />); openLegacy();
    expect(location.hash).toBe("#legacy-notification"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("highlights alerts and treats message content as plain text", () => {
    const body = '<img src="x" onerror="alert(1)">\nJob: QA-123\nCharge: GBP 18.00';
    render(<NotificationDetailModal notification={{ ...notification, body, kind: "congestion_zone" }} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Congestion alert")).toBeInTheDocument();
    expect(dialog.querySelector("p")?.textContent).toBe(body); expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.querySelector(".border-warning")).toBeInTheDocument();
  });
  it.each(["/?tab=jobs", "javascript:alert(1)", "https://other.example.invalid/job", "//other.example.invalid/job"])("does not offer a related-page link for destination: %s", url => {
    render(<NotificationDetailModal notification={{ ...notification, url, kind: "__proto__", receivedAt: NaN }} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog"); expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Time unavailable")).toBeInTheDocument();
    expect(within(dialog).getByText("Notification", { exact: true })).toBeInTheDocument();
  });
});

function openLegacy() {
  fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
  fireEvent.click(screen.getByRole("menuitem"));
}
