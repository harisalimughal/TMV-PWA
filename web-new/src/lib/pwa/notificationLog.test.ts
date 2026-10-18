import { describe, expect, it } from "vitest";
import { visibleNotifications, unreadCountForNotifications, type LoggedNotification } from "./notificationLog";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

function notification(overrides: Partial<LoggedNotification>): LoggedNotification {
  return {
    id: 1,
    title: "Job update",
    body: "A job changed",
    url: "/",
    receivedAt: NOW,
    read: false,
    ...overrides
  };
}

describe("notification log retention", () => {
  it("keeps notifications received within the last 24 hours", () => {
    const recent = notification({ id: 1, receivedAt: NOW - 23 * HOUR });
    const expired = notification({ id: 2, receivedAt: NOW - 25 * HOUR });

    expect(visibleNotifications([expired, recent], NOW)).toEqual([recent]);
  });

  it("does not count expired unread notifications", () => {
    const recentUnread = notification({ id: 1, read: false, receivedAt: NOW - HOUR });
    const oldUnread = notification({ id: 2, read: false, receivedAt: NOW - 25 * HOUR });
    const recentRead = notification({ id: 3, read: true, receivedAt: NOW - 2 * HOUR });

    expect(unreadCountForNotifications([recentUnread, oldUnread, recentRead], NOW)).toBe(1);
  });
});
