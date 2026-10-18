/**
 * Global search and command palette (Ctrl/Cmd K).
 *
 * Finds drivers, jobs, customers, vans, liability records, alerts, pages and actions
 * through the providers in `search/`, ranks them deterministically and opens the exact
 * record: a job opens its dialog, a driver opens their report, a van or a liability
 * record opens its preview. Server providers are debounced, cancellable and cached;
 * a provider that fails is reported as unavailable, never as "no results".
 *
 * Empty query: recently opened records, this session's recent searches and quick
 * actions. History stays in this browser and is cleared on sign-out (search/history.ts).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Clock, CornerDownLeft, FileText, History, Loader2, Search, Truck, User, Users, X, AlertTriangle, Bell, LayoutGrid, Zap, type LucideIcon } from "lucide-react";
import { navigateTo, openJob, sectionHref } from "../navigation";
import { guardNavigation } from "../utils/unsavedChanges";
import { cx } from "../../../../ui/cx";
import { useDialogFocus } from "../../../../ui/useDialogFocus";
import { isMacPlatform } from "../utils/platform";
import { highlightParts, TIER } from "../search/searchCore";
import { DESTINATIONS, GROUP_LABEL, GROUP_ORDER, fallbackDestinations, type ResultType, type SearchResult, type Target } from "../search/providers";
import { clearSearchHistory, recentItems, recentQueries, rememberQuery, rememberResult, type RecentItem } from "../search/history";
import { MIN_SERVER_QUERY, SCOPES, useGlobalSearch, type Scope } from "../search/useGlobalSearch";
import { dateRangeForPreset } from "./DateRangePicker";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Kept for callers; destinations navigate through the shared admin router. */
  onSelectSection?: (id: string, params?: Record<string, string | undefined>) => void;
}

/** Kept for compatibility: server providers start at this many characters. */
export const MIN_JOB_QUERY = MIN_SERVER_QUERY;

type Row =
  | { kind: "result"; key: string; group: string; result: SearchResult }
  | { kind: "more"; key: string; group: string; label: string; target: Target }
  | { kind: "recent"; key: string; group: string; item: RecentItem }
  | { kind: "query"; key: string; group: string; text: string }
  | { kind: "suggest"; key: string; group: string; result: SearchResult };

const ICON: Record<ResultType, LucideIcon> = { driver: User, job: FileText, customer: Users, vehicle: Truck, liability: AlertTriangle, action: Zap, page: LayoutGrid, alert: Bell };
const GROUP_LIMIT = 5;
const QUICK = ["generate-report", "jobs", "drivers", "evidence-parking", "vans-attention", "alerts"];

function go(target: Target) {
  if (target.kind === "job") openJob(target.jobId);
  else guardNavigation(() => navigateTo(target.href));
}

function Highlight({ text, query }: { text: string; query: ReturnType<typeof useGlobalSearch>["parts"]["query"] }) {
  return <>{highlightParts(text, query).map((part, index) => part.hit ? <mark key={index} className="rounded-[3px] bg-admin-brand-soft px-px font-semibold text-admin-brand-dark">{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}

/** Rows for a query: best matches, then each type, with "view all" links. */
export function buildRows(results: SearchResult[], search: { text: string; request: ReturnType<typeof useGlobalSearch>["request"] }, scope: Scope): Row[] {
  const rows: Row[] = [];
  const shown = new Set<string>();
  const types = new Set(results.map(result => result.type));
  if (scope === "all" && types.size > 1) {
    for (const result of results.slice(0, 3).filter(result => result.score >= TIER.wordPrefix)) {
      rows.push({ kind: "result", key: `best:${result.type}:${result.id}`, group: "Best matches", result });
      shown.add(`${result.type}:${result.id}`);
    }
  }
  const limit = scope === "all" ? GROUP_LIMIT : 12;
  const vans = dateRangeForPreset("30d");
  for (const type of GROUP_ORDER) {
    const all = results.filter(result => result.type === type);
    const rest = all.filter(result => !shown.has(`${result.type}:${result.id}`));
    if (!all.length) continue;
    const group = GROUP_LABEL[type];
    for (const result of rest.slice(0, limit)) rows.push({ kind: "result", key: `${type}:${result.id}`, group, result });
    const q = search.text;
    const more: Partial<Record<ResultType, { label: string; target: Target }>> = {
      job: { label: `View all matching jobs`, target: { kind: "href", href: sectionHref("jobs", { q: search.request?.q || q, range: search.request?.from ? undefined : "all", from: search.request?.from, to: search.request?.to, driver: search.request?.driver }) } },
      customer: { label: `View all jobs for “${q}”`, target: { kind: "href", href: sectionHref("jobs", { q, range: "all" }) } },
      driver: { label: "View all matching drivers", target: { kind: "href", href: sectionHref("drivers", { q, view: "drivers", mode: "table" }) } },
      vehicle: { label: "View all matching vans", target: { kind: "href", href: sectionHref("vehicles", { q, from: vans.from, to: vans.to }) } }
    };
    const link = more[type];
    if (link && (all.length > 1 || type === "job")) rows.push({ kind: "more", key: `more:${type}`, group, ...link });
  }
  return rows;
}

function quickRows(): Row[] {
  const recent = recentItems().map(item => ({ kind: "recent" as const, key: `recent:${item.type}:${item.id}`, group: "Recently opened", item }));
  const queries = recentQueries().map(text => ({ kind: "query" as const, key: `query:${text}`, group: "Recent searches", text }));
  const quick = QUICK.map(id => DESTINATIONS.find(entry => entry.id === id)).filter(Boolean).map(entry => ({
    kind: "result" as const, key: `quick:${entry!.id}`, group: "Quick actions",
    result: { type: entry!.type, id: entry!.id, label: entry!.label, detail: entry!.detail, target: { kind: "href" as const, href: entry!.href() }, score: 0 }
  }));
  return [...recent, ...queries, ...quick];
}

const RECENT_ICON: Record<RecentItem["type"], LucideIcon> = { driver: User, job: FileText, vehicle: Truck, liability: AlertTriangle, action: Zap, page: LayoutGrid };

export function CommandPalette({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return createPortal(<PaletteDialog onClose={onClose} />, document.body);
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [active, setActive] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const titleId = useId();
  useDialogFocus(true, panelRef, onClose);
  useEffect(() => { const frame = requestAnimationFrame(() => inputRef.current?.focus()); return () => cancelAnimationFrame(frame); }, []);

  const search = useGlobalSearch(query, scope);
  const empty = !search.text;
  const rows: Row[] = useMemo(() => empty ? quickRows() : buildRows(search.results, search, scope), [empty, search.results, search.text, search.request, scope, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const noMatches = !empty && !rows.length && !search.pending;
  const fallback: Row[] = useMemo(() => noMatches ? fallbackDestinations().map(result => ({ kind: "suggest" as const, key: `suggest:${result.id}`, group: "Try one of these instead", result })) : [], [noMatches]);
  const options = rows.length ? rows : fallback;

  useEffect(() => { setActive(0); }, [search.text, scope]);
  useEffect(() => { setActive(index => Math.min(index, Math.max(0, options.length - 1))); }, [options.length]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" }); }, [active]);

  const choose = (row: Row) => {
    if (row.kind === "query") { setQuery(row.text); inputRef.current?.focus(); return; }
    if (search.text) rememberQuery(search.text);
    if (row.kind === "result" || row.kind === "suggest") rememberResult(row.result);
    const target = row.kind === "recent" ? row.item.target : row.kind === "more" ? row.target : row.result.target;
    onClose();
    go(target);
  };

  const activeRow = options[active];
  const preview = activeRow && (activeRow.kind === "result") ? activeRow.result.preview : undefined;
  const failed = search.failed.map(status => status.label);
  const announce = empty ? "" : search.pending ? "Searching" : rows.length ? `${search.results.length} result${search.results.length === 1 ? "" : "s"}` : "No matches";

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center tmv-scrim sm:p-3 sm:pt-[8vh]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("tmv-palette flex w-full flex-col overflow-hidden border-admin-line bg-surface text-admin-ink outline-none",
          "max-sm:h-dvh max-sm:pb-[env(safe-area-inset-bottom)] max-sm:pt-[env(safe-area-inset-top)]",
          "sm:max-h-[min(84vh,680px)] sm:rounded-2xl sm:border sm:shadow-xl", preview ? "sm:max-w-[880px]" : "sm:max-w-[680px]")}
        onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => (index + 1) % Math.max(1, options.length)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => (index - 1 + options.length) % Math.max(1, options.length)); }
          else if (event.key === "Home" && event.ctrlKey) { event.preventDefault(); setActive(0); }
          else if (event.key === "End" && event.ctrlKey) { event.preventDefault(); setActive(Math.max(0, options.length - 1)); }
          else if (event.key === "Enter" && activeRow && (event.target as HTMLElement).tagName === "INPUT") { event.preventDefault(); choose(activeRow); }
        }}>
        <h2 id={titleId} className="sr-only">Search TMV</h2>
        {/* The whole search row shows focus: a ring on the input alone would be clipped. */}
        <div className="flex items-center gap-3 border-b border-admin-line px-4 focus-within:border-admin-brand">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-admin-brand" />
          <input ref={inputRef} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={activeRow ? `${listId}-${active}` : undefined} aria-label="Search drivers, jobs, customers, vans, liability records and pages"
            value={query} onChange={event => setQuery(event.target.value)} spellCheck={false} autoComplete="off" enterKeyHint="search"
            placeholder="Search drivers, jobs, customers, vans…"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none focus-visible:outline-none placeholder:text-admin-muted" />
          {search.pending && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-admin-muted" />}
          {query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-semibold text-admin-ink-2 hover:bg-admin-surface">Clear</button>}
          <button type="button" onClick={onClose} aria-label="Close search" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div role="group" aria-label="Search in" className="flex gap-1.5 overflow-x-auto border-b border-admin-line px-3 py-2 [scrollbar-width:none]">
          {SCOPES.map(entry => (
            <button key={entry.id} type="button" aria-pressed={scope === entry.id} onClick={() => { setScope(entry.id); inputRef.current?.focus(); }}
              className={cx("shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors",
                scope === entry.id ? "border-admin-brand/40 bg-admin-brand-soft text-admin-brand-dark" : "border-admin-line text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink")}>
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1">
          <div tabIndex={0} aria-label="Search results" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand sm:max-h-[min(60vh,500px)]">
            <div aria-live="polite" className="sr-only">{announce}</div>
            {failed.length > 0 && (
              <p role="alert" className="mx-1.5 my-1 flex gap-2 rounded-lg border border-admin-status-amber/30 bg-admin-status-amber-bg px-3 py-2 text-[13px] text-admin-ink">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-admin-status-amber" />
                <span>{failed.join(", ")} could not be searched right now. Other results are still shown.</span>
              </p>
            )}
            {!empty && search.text.length < MIN_SERVER_QUERY && <p className="px-3 py-1.5 text-[12.5px] text-admin-ink-2">Showing drivers, vans and pages. Type one more character to search jobs and records.</p>}
            {empty && !rows.some(row => row.kind !== "result") && <p className="px-3 py-1.5 text-[12.5px] text-admin-ink-2">Search by name, initials, job reference, registration, postcode or date, for example “TI”, “489F”, “YC68” or “Alex 13 Oct”.</p>}
            {noMatches && (
              <div className="px-3 pb-1 pt-3">
                <p className="text-[14px] font-semibold text-admin-ink">{failed.length ? `No matches in the sources that answered for “${search.text}”` : `No matches for “${search.text}”`}</p>
                <p className="mt-0.5 text-[12.5px] text-admin-ink-2">{scope !== "all" ? "Try All instead of one type, or " : "Try "}a job reference, a surname, initials or part of an address.</p>
              </div>
            )}
            {!empty && !rows.length && search.pending && <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-admin-ink-2"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />Searching jobs, vans and liability records…</p>}

            <ul ref={listRef} id={listId} role="listbox" aria-label="Search results">
              {options.map((row, index) => {
                const showHeading = index === 0 || options[index - 1].group !== row.group;
                const selected = index === active;
                const Icon = row.kind === "recent" ? RECENT_ICON[row.item.type] ?? History : row.kind === "query" ? Clock : row.kind === "more" ? ArrowRight : ICON[row.result.type];
                const label = row.kind === "recent" ? row.item.label : row.kind === "query" ? row.text : row.kind === "more" ? row.label : row.result.label;
                const detail = row.kind === "result" || row.kind === "suggest" ? row.result.detail : row.kind === "recent" ? GROUP_LABEL[row.item.type as ResultType]?.replace(/s$/, "") : undefined;
                return (
                  <React.Fragment key={row.key}>
                    {showHeading && (
                      <li role="presentation" className="flex items-center justify-between px-3 pb-1 pt-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">
                        {row.group}
                        {row.group === "Recent searches" || (row.group === "Recently opened" && !options.some(other => other.group === "Recent searches")) ? (
                          <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => { clearSearchHistory(); setHistoryVersion(v => v + 1); }}
                            className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold normal-case tracking-normal text-admin-brand hover:bg-admin-brand-soft">Clear history</button>
                        ) : null}
                      </li>
                    )}
                    <li id={`${listId}-${index}`} data-index={index} role="option" aria-selected={selected}
                      onMouseMove={() => { if (!selected) setActive(index); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(row)}
                      className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2", selected ? "bg-admin-brand-soft text-admin-brand-dark" : "hover:bg-admin-surface")}>
                      <span aria-hidden className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", selected ? "border-admin-brand/30 bg-surface text-admin-brand" : "border-admin-line bg-admin-surface text-admin-ink-2")}>
                        {row.kind === "result" && row.result.type === "driver" ? <span className="text-[11px] font-bold">{row.result.id.slice(0, 2)}</span> : <Icon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate text-[14px]", row.kind === "more" ? "font-semibold text-admin-brand" : "font-medium")}>
                          {row.kind === "result" || row.kind === "suggest" ? <Highlight text={label} query={search.parts.query} /> : label}
                        </span>
                        {detail && <span className="block truncate text-[12.5px] text-admin-ink-2">{row.kind === "result" ? <Highlight text={detail} query={search.parts.query} /> : detail}</span>}
                      </span>
                      <CornerDownLeft aria-hidden className={cx("h-4 w-4 shrink-0", selected ? "opacity-80" : "opacity-0")} />
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </div>

          {preview && (
            <aside aria-label="Preview" className="hidden w-[260px] shrink-0 border-l border-admin-line bg-admin-surface/60 p-4 sm:block">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">{activeRow && activeRow.kind === "result" ? GROUP_LABEL[activeRow.result.type].replace(/s$/, "") : ""}</p>
              <dl className="mt-2 space-y-2.5">
                {preview.map(entry => (
                  <div key={entry.label}>
                    <dt className="text-[12px] text-admin-ink-2">{entry.label}</dt>
                    <dd className="break-words text-[13.5px] font-semibold text-admin-ink">{entry.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex items-center gap-1.5 text-[12px] text-admin-ink-2"><kbd className="rounded border border-admin-line bg-surface px-1 font-sans font-semibold">Enter</kbd>opens the record</p>
            </aside>
          )}
        </div>

        <div className="hidden flex-wrap gap-x-4 gap-y-1 border-t border-admin-line px-4 py-2 text-[12px] text-admin-ink-2 sm:flex">
          <span><kbd className="font-sans font-semibold">↑ ↓</kbd> move</span>
          <span><kbd className="font-sans font-semibold">Enter</kbd> open</span>
          <span><kbd className="font-sans font-semibold">Tab</kbd> filters</span>
          <span><kbd className="font-sans font-semibold">Esc</kbd> close</span>
          <span className="ml-auto">{isMacPlatform() ? "⌘K" : "Ctrl K"} opens search anywhere</span>
        </div>
      </div>
    </div>
  );
}
