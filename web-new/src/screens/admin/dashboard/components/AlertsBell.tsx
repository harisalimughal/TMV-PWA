import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cx } from "../../../../ui/cx";
import { useAttention } from "../hooks/useAttention";
import { useAlertsRead } from "../hooks/useAlertsRead";
import { openJob } from "../navigation";
import { Badge, focusRing } from "./ds";
import { formatShortDateTime } from "../utils/format";

/**
 * Header bell. Reads the same `useAttention` source as the Alerts page and the
 * Overview list, so the list here always matches what "View all" shows. The badge
 * counts urgent items not yet marked read in this browser (see useAlertsRead).
 */
export function AlertsBell({ onOpenAlerts }: { onOpenAlerts: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { items, failed, loading } = useAttention();
  const { isRead, markAllRead } = useAlertsRead();
  const unread = items.filter(item => !isRead(item));
  const urgent = unread.filter(item => item.severity !== "low");

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const label = loading ? "Alerts (loading)" : `Alerts: ${items.length} item${items.length === 1 ? "" : "s"} need attention, ${unread.length} unread${failed.length ? `, ${failed.length} source${failed.length === 1 ? "" : "s"} unavailable` : ""}`;
  return (
    <div ref={rootRef} className="relative">
      <button ref={buttonRef} type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}
        className={cx("relative grid h-10 w-10 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {urgent.length > 0 && (
          <span aria-hidden className="absolute right-1 top-1 min-w-[18px] rounded-full bg-admin-status-red px-1 text-center text-[11px] font-bold leading-[18px] text-white">{urgent.length > 99 ? "99+" : urgent.length}</span>
        )}
        {!urgent.length && failed.length > 0 && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-admin-status-amber" />}
      </button>
      {open && (
        <div role="dialog" aria-label="Needs attention" className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-24px))] max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(60px+env(safe-area-inset-top))] max-sm:w-auto overflow-hidden rounded-xl border border-admin-line bg-white shadow-md">
          <div className="flex items-center justify-between border-b border-admin-line px-4 py-2.5">
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">Needs attention</span>
              <span className="block text-[12.5px] text-admin-ink-2">{loading ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"} · ${unread.length} unread`}</span>
            </span>
            <button type="button" disabled={loading || !unread.length} onClick={() => markAllRead(items)}
              title="Clears the badge in this browser. Items stay listed until they are resolved."
              className={cx("h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-semibold text-admin-brand hover:bg-admin-surface disabled:cursor-default disabled:text-admin-ink-2 disabled:opacity-60 disabled:hover:bg-transparent", focusRing)}>
              Mark all as read
            </button>
          </div>
          {failed.length > 0 && <p className="border-b border-admin-line bg-admin-status-amber-bg px-4 py-2 text-[12.5px] text-admin-ink">Not loaded: {failed.map(source => source.label).join(", ")}. This list may be incomplete.</p>}
          <ul className="max-h-[360px] divide-y divide-admin-line overflow-y-auto">
            {items.slice(0, 6).map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => { setOpen(false); if (item.action.kind === "job" && item.action.target) openJob(item.action.target); else onOpenAlerts(); }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-admin-surface focus-visible:bg-admin-brand-soft/40 focus-visible:outline-none">
                  <span className="flex items-center gap-2">
                    {isRead(item) ? <span className="sr-only">Read. </span> : <><span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-admin-brand" /><span className="sr-only">Unread. </span></>}
                    <Badge tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "neutral"}>{item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}</Badge><span className={cx("truncate text-[13.5px] text-admin-ink", isRead(item) ? "font-medium" : "font-semibold")}>{item.title}</span></span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-admin-ink-2">{item.detail}{item.at ? ` · ${formatShortDateTime(item.at)}` : ""}</span>
                </button>
              </li>
            ))}
            {!loading && !items.length && <li className="px-4 py-6 text-center text-[13px] text-admin-ink-2">{failed.length ? "Nothing found in the sources that loaded." : "Nothing needs attention right now."}</li>}
          </ul>
          <button type="button" onClick={() => { setOpen(false); onOpenAlerts(); }} className="block w-full border-t border-admin-line px-4 py-2.5 text-center text-[13.5px] font-semibold text-admin-brand hover:bg-admin-surface">View all alerts</button>
        </div>
      )}
    </div>
  );
}
