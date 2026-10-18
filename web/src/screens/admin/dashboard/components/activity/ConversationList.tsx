import type { KeyboardEvent } from "react";
import { DateTime } from "luxon";
import { clock, previewText, statusLabel, unreadLabel, type ActivityConversation } from "../../../../../lib/activity";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "../ds";

const LONDON = "Europe/London";

/** Time for the list: clock today, "Yesterday", else the date. */
function listTime(iso: string): string {
  const at = DateTime.fromISO(iso, { zone: "utc" }).setZone(LONDON), now = DateTime.now().setZone(LONDON);
  if (at.hasSame(now, "day")) return clock(iso);
  if (at.hasSame(now.minus({ days: 1 }), "day")) return "Yesterday";
  return at.toFormat("d LLL");
}

/** Move focus between conversations with the arrow keys, Home, End, or j and k. Enter and Space open the focused one. */
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const step = event.key === "ArrowDown" || event.key === "j" ? 1 : event.key === "ArrowUp" || event.key === "k" ? -1 : 0;
  const edge = event.key === "Home" ? "first" : event.key === "End" ? "last" : "";
  if (!step && !edge) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  if (!buttons.length) return;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = edge === "first" ? 0 : edge === "last" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at < 0 ? 0 : at + step));
  event.preventDefault();
  buttons[next].focus();
}

export function ConversationList({ items, selected, onSelect }: { items: ActivityConversation[]; selected?: string; onSelect: (jobId: string) => void }) {
  return (
    <ul aria-label="Conversations" onKeyDown={moveFocus} className="divide-y divide-admin-line">
      {items.map(item => {
        const active = item.jobId === selected;
        return (
          <li key={item.jobId}>
            <button type="button" onClick={() => onSelect(item.jobId)} aria-current={active ? "true" : undefined}
              className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", focusRing, active ? "bg-admin-brand-soft" : "hover:bg-admin-surface")}>
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-admin-line bg-admin-surface text-[13px] font-semibold text-admin-ink-2">{item.driver.initials}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("truncate text-[14.5px] text-admin-ink", item.unreadCount ? "font-bold" : "font-semibold")}>{item.driver.name}</span>
                  <span className="shrink-0 text-[12px] text-admin-muted">{listTime(item.lastActivityAt)}</span>
                </span>
                <span className="block truncate text-[12.5px] text-admin-ink-2">{item.jobId}{item.customerName ? ` · ${item.customerName}` : ""} · {statusLabel(item.jobStatus, item.currentState)}</span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cx("truncate text-[13px]", item.unreadCount ? "font-semibold text-admin-ink" : "text-admin-muted")}>{previewText(item.lastMessage, "admin")}</span>
                  {item.unreadCount > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-admin-brand px-1.5 text-[11.5px] font-bold text-white">
                      <span aria-hidden>{unreadLabel(item.unreadCount)}</span><span className="sr-only">{item.unreadCount} unread</span>
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
