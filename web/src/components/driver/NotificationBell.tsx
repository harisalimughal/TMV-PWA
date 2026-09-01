import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { EmptyState } from "../../ui";
import { useNotificationLog } from "../../lib/pwa/useNotificationLog";
import type { LoggedNotification } from "../../lib/pwa/notificationLog";

function relativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * The bell icon in the app header: unread count badge, a dropdown of recent push
 * notifications (see lib/pwa/notificationLog.ts / useNotificationLog.ts), and click-
 * through navigation -- tapping an item marks it read and takes the driver straight
 * to whatever screen the notification was about, the same place tapping the OS
 * notification itself goes (push-worker.js's notificationclick). This is the in-app
 * equivalent of that for someone who already has the app open and dismissed (or never
 * saw) the OS notification.
 */
export function NotificationBell() {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotificationLog();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelShiftX, setPanelShiftX] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  // The panel defaults to right-aligned under the trigger (className below), which is
  // correct wherever the bell sits near the right edge of its container -- the mobile
  // header, the admin header. It's wrong for the desktop sidebar, whose trigger sits
  // near the LEFT edge of the whole viewport (the sidebar itself is only ~260px wide):
  // right-aligning there tries to open the panel mostly to the left of the trigger,
  // off the edge of the screen entirely. Rather than hardcode a different alignment
  // per surface (fragile the next time the bell moves somewhere new), this measures
  // where the panel actually landed after render and nudges it back on-screen with a
  // transform if either edge overflows -- correct in any container, automatically.
  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current) {
      setPanelShiftX(0);
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    const margin = 12;
    if (rect.left < margin) {
      setPanelShiftX(margin - rect.left);
    } else if (rect.right > window.innerWidth - margin) {
      setPanelShiftX(window.innerWidth - margin - rect.right);
    } else {
      setPanelShiftX(0);
    }
  }, [isOpen, items.length]);

  function handleSelect(item: LoggedNotification) {
    void markRead(item.id);
    setIsOpen(false);
    window.location.href = item.url || "/";
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
      >
        <Bell className="size-[17px]" aria-hidden />
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-1 grid size-4 min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="menu"
          style={{ transform: panelShiftX ? `translateX(${panelShiftX}px)` : undefined }}
          className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-card border border-line bg-surface shadow-md animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-label font-semibold text-fg">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-meta font-medium text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!loading && items.length === 0 && (
              <div className="px-4 py-8">
                <EmptyState
                  icon={<BellOff />}
                  title="No notifications yet"
                  description="Job updates and alerts will show up here."
                />
              </div>
            )}
            {items.map(item => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(item)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-sunken"
              >
                <span className="flex w-full items-center gap-2">
                  {!item.read && <span className="size-1.5 shrink-0 rounded-pill bg-brand" aria-hidden />}
                  <span className={`flex-1 truncate text-label ${item.read ? "font-medium text-fg-muted" : "font-semibold text-fg"}`}>
                    {item.title}
                  </span>
                  <span className="shrink-0 text-meta text-fg-subtle">{relativeTime(item.receivedAt)}</span>
                </span>
                <span className="line-clamp-2 text-helper text-fg-muted">{item.body}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
