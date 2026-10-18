import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cx } from "../../../../../ui/cx";
import { controlBase, focusRing } from "./primitives";
import { useKeepSelectedVisible } from "./segmented";

export interface ActiveFilter { id: string; label: string; onRemove: () => void }

/**
 * The one filter bar: date/search/filters on the left, result count and secondary
 * actions on the right, active filters as removable chips with a single Clear
 * filters action underneath (audit p.4 "Show active filters and one Clear filters
 * action").
 */
export function Toolbar({ children, count, actions, activeFilters = [], onClearFilters, label = "Filters" }: {
  children?: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  activeFilters?: ActiveFilter[];
  onClearFilters?: () => void;
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-admin-line bg-white">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 p-2.5">
        {children}
        {(count || actions) && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {count && <span aria-live="polite" className="whitespace-nowrap px-1 text-[13px] font-medium text-admin-ink-2">{count}</span>}
            {actions}
          </div>
        )}
      </div>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-admin-line px-2.5 py-2">
          <span className="text-[12.5px] text-admin-ink-2">Active filters:</span>
          {activeFilters.map(filter => (
            <span key={filter.id} className="inline-flex items-center gap-1 rounded-full border border-admin-brand/25 bg-admin-brand-soft py-0.5 pl-2.5 pr-1 text-[12.5px] font-medium text-admin-brand-dark">
              {filter.label}
              <button type="button" onClick={filter.onRemove} aria-label={`Remove filter ${filter.label}`} className={cx("grid h-6 w-6 place-items-center rounded-full hover:bg-white/70", focusRing)}>
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {onClearFilters && (
            <button type="button" onClick={onClearFilters} className={cx("ml-1 rounded text-[13px] font-semibold text-admin-brand hover:underline", focusRing)}>Clear filters</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Search field with a visible-on-focus label, a clear button and optional debounce. */
export function SearchField({ value, onChange, placeholder, label, debounceMs = 0, className }: {
  value: string; onChange: (value: string) => void; placeholder: string; label: string; debounceMs?: number; className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!debounceMs || draft === value) return;
    const timer = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (next: string) => { setDraft(next); if (!debounceMs) onChange(next); };
  return (
    <div className={cx("relative w-full sm:w-72", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
      <input
        type="search"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={event => update(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && debounceMs) onChange(draft); }}
        className={cx(controlBase, "w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden")}
      />
      {draft && (
        <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); onChange(""); }}
          className={cx("absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-admin-muted hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export interface SelectOption { value: string; label: string }

/** Filter dropdown. The accessible name is always the filter's purpose ("Driver"),
 *  and the first option names the unfiltered state ("All drivers"). */
export function FilterSelect({ label, value, onChange, options, allLabel, disabled, className }: {
  label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; allLabel?: string; disabled?: boolean; className?: string;
}) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={cx(controlBase, "min-w-0 pr-8", className)}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

/**
 * Compact single-choice filter (status, view). Rendered as a radiogroup with roving
 * focus; each option shows an optional count.
 */
export function ChoiceChips<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; count?: number }>;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex(option => option.value === value));
  const groupRef = React.useRef<HTMLDivElement>(null);
  useKeepSelectedVisible(groupRef, index);
  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className="tmv-segmented inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-2xl border border-admin-line bg-admin-surface p-1"
      onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
        onChange(options[next].value);
        refs.current[next]?.focus();
      }}>
      {options.map((option, optionIndex) => {
        const selected = option.value === value;
        return (
          <button key={option.value} ref={element => { refs.current[optionIndex] = element; }} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition", focusRing,
              selected ? "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)] ring-1 ring-admin-brand/25" : "text-admin-ink-2 hover:text-admin-ink")}>
            {option.label}
            {option.count !== undefined && <span className={cx("rounded-full px-1.5 text-[12px] tabular-nums", selected ? "bg-admin-brand-soft text-admin-brand-dark" : "bg-white/80 text-admin-ink-2")}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
