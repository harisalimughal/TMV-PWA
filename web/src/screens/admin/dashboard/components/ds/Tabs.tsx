import React, { useId, useRef } from "react";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "./primitives";
import { useKeepSelectedVisible } from "./segmented";

export interface TabItem<T extends string> { id: T; label: React.ReactNode; badge?: React.ReactNode }

/**
 * Accessible tablist (WAI-ARIA tabs pattern): arrow keys / Home / End move between
 * tabs and activate them, only the selected tab is in the tab order. The owner
 * renders the active panel with {@link TabPanel} using the same `idBase`.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, idBase, className, variant = "underline" }: {
  tabs: TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; idBase?: string; className?: string;
  /** "segmented": a pill group, for a small set of peer views (e.g. the four liability scenarios). */
  variant?: "underline" | "segmented";
}) {
  const generated = useId();
  const base = idBase ?? generated;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, tabs.findIndex(tab => tab.id === value));
  const listRef = useRef<HTMLDivElement>(null);
  useKeepSelectedVisible(listRef, current);
  const move = (next: number) => { onChange(tabs[next].id); refs.current[next]?.focus(); };
  return (
    <div ref={listRef} role="tablist" aria-label={label} className={cx(variant === "segmented"
      ? "tmv-segmented inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-2xl border border-admin-line bg-admin-surface p-1"
      : "flex max-w-full gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-admin-line", className)}
      onKeyDown={event => {
        const keys: Record<string, number> = { ArrowRight: (current + 1) % tabs.length, ArrowLeft: (current - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        move(keys[event.key]);
      }}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button key={tab.id} ref={element => { refs.current[index] = element; }} type="button" role="tab" id={`${base}-tab-${tab.id}`}
            aria-selected={selected} aria-controls={`${base}-panel-${tab.id}`} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cx(variant === "segmented"
              ? cx("inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition", focusRing,
                selected ? "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)] ring-1 ring-admin-brand/25" : "text-admin-ink-2 hover:text-admin-ink")
              : cx("relative -mb-px inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 text-[14px] min-[360px]:px-3 font-semibold transition", focusRing,
                selected ? "border-admin-brand text-admin-ink" : "border-transparent text-admin-ink-2 hover:text-admin-ink"))}>
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, id, children, className }: { idBase: string; id: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} tabIndex={0} className={cx("outline-none", className)}>
      {children}
    </div>
  );
}
