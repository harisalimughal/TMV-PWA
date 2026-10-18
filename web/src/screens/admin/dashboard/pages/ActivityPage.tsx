/**
 * Activity: one conversation per job, showing what the driver app recorded and the office's direct
 * messages to the assigned driver. Everything on screen comes from the server; this page never
 * invents an entry, a delivery tick, a typing indicator or an online status.
 *
 * Narrow screens show the list, then the chat; the chosen conversation lives in the URL so Back works.
 */
import { useMemo, useRef } from "react";
import { DateTime } from "luxon";
import { MessagesSquare, X } from "lucide-react";
import { ACTIVITY_FILTER_GROUPS, filterGroupById, type ConversationQuery } from "../../../../lib/activity";
import { cx } from "../../../../ui/cx";
import { ChatPane } from "../components/activity/ChatPane";
import { ConversationList } from "../components/activity/ConversationList";
import { EmptyState, ErrorState, LoadingState, PageHeader, SearchField, controlBase, focusRing } from "../components/ds";
import { useUrlState } from "../hooks/useUrlState";
import { isUnavailable, useConversations } from "../hooks/useActivity";
import { useDriverOptions } from "../hooks/useDriverOptions";

const LONDON = "Europe/London";
const WHEN = [["all", "Any date"], ["today", "Today"], ["yesterday", "Yesterday"], ["week", "Last 7 days"]] as const;

/** Date presets as London-day ISO bounds. */
function whenRange(when: string, now = DateTime.now().setZone(LONDON)): Pick<ConversationQuery, "from" | "to"> {
  const day = now.startOf("day");
  if (when === "today") return { from: day.toUTC().toISO()! };
  if (when === "yesterday") return { from: day.minus({ days: 1 }).toUTC().toISO()!, to: day.toUTC().toISO()! };
  if (when === "week") return { from: day.minus({ days: 6 }).toUTC().toISO()! };
  return {};
}

export function ActivityPage() {
  const [state, setState] = useUrlState({ conversation: "", q: "", driver: "", group: "", when: "all", unread: "" });
  const drivers = useDriverOptions();
  const group = filterGroupById(state.group);
  const query = useMemo<ConversationQuery>(() => ({
    q: state.q.trim() || undefined, driver: state.driver || undefined, types: group?.types, unreadOnly: state.unread === "1" || undefined, ...whenRange(state.when)
  }), [state.q, state.driver, group, state.unread, state.when]);
  const conversations = useConversations(query);
  const items = conversations.data?.items ?? [];
  const selected = items.find(item => item.jobId === state.conversation);
  const filtered = Boolean(state.q || state.driver || state.group || state.unread || state.when !== "all");
  const unavailable = isUnavailable(conversations.error);
  const unreadChats = items.filter(item => item.unreadCount > 0).length;
  const listRef = useRef<HTMLDivElement>(null);
  const clearFilters = () => setState({ q: "", driver: "", group: "", when: "all", unread: "" });
  // "/" jumps to search, and Escape on a chat returns to the list, like the other admin pages.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const field = event.currentTarget.querySelector<HTMLInputElement>('input[type="search"], input[aria-label="Search conversations"]');
      if (field) { event.preventDefault(); field.focus(); }
    } else if (event.key === "Escape" && !typing && state.conversation && !document.querySelector('[role="dialog"]')) {
      setState({ conversation: "" }, { push: true });
    }
  };

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <PageHeader title="Activity" scope="What drivers have recorded, one conversation per job · London time" />

      <div className="tmv-panel flex flex-col overflow-hidden rounded-2xl border border-admin-line md:flex-row" style={{ height: "calc(100dvh - 12.5rem)", minHeight: "30rem" }}>
        <aside aria-label="Conversation list" className={cx("flex min-h-0 w-full flex-col border-admin-line md:w-[22.5rem] md:shrink-0 md:border-r lg:w-[25rem]", state.conversation ? "hidden md:flex" : "flex")}>
          <div className="space-y-2 border-b border-admin-line p-3">
            <SearchField value={state.q} onChange={q => setState({ q })} debounceMs={250} label="Search conversations" placeholder="Search job, customer or driver" />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Driver" value={state.driver} onChange={event => setState({ driver: event.target.value })} className={cx(controlBase, "w-full")}>
                <option value="">All drivers</option>
                {drivers.options.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName || driver.initials}</option>)}
              </select>
              <select aria-label="Activity type" value={state.group} onChange={event => setState({ group: event.target.value })} className={cx(controlBase, "w-full")}>
                <option value="">All activity</option>
                {ACTIVITY_FILTER_GROUPS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <select aria-label="Date" value={state.when} onChange={event => setState({ when: event.target.value })} className={cx(controlBase, "w-full")}>
                {WHEN.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-admin-line bg-surface px-3 text-[14px] text-admin-ink">
                <input type="checkbox" checked={state.unread === "1"} onChange={event => setState({ unread: event.target.checked ? "1" : "" })} className="h-4 w-4 accent-[var(--admin-brand,#7C3AED)]" />Unread only
              </label>
            </div>
          </div>
          {conversations.isSuccess && (
            <div className="flex items-center justify-between gap-2 border-b border-admin-line px-3 py-1.5 text-[12.5px] text-admin-ink-2">
              <p role="status">{items.length} {items.length === 1 ? "conversation" : "conversations"}{unreadChats ? `, ${unreadChats} unread` : ""}</p>
              {filtered && (
                <button type="button" onClick={clearFilters} className={cx("inline-flex min-h-6 items-center gap-1 rounded-lg px-2 font-semibold text-admin-brand-dark hover:bg-admin-surface", focusRing)}>
                  <X aria-hidden className="h-3.5 w-3.5" />Clear filters
                </button>
              )}
            </div>
          )}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {conversations.isLoading && <LoadingState label="Loading conversations" rows={6} />}
            {unavailable && <EmptyState title="Activity is not available on this server" message="Job activity needs a server that provides it. Nothing is shown rather than sample data." />}
            {conversations.isError && !unavailable && <ErrorState compact title="Conversations could not be loaded" message={(conversations.error as Error).message} onRetry={() => void conversations.refetch()} />}
            {conversations.isSuccess && !items.length && (
              <EmptyState compact kind={filtered ? "no-matches" : "empty"} title={filtered ? "No conversations match" : "No activity yet"} message={filtered ? "Try clearing a filter." : "Updates appear here once a driver starts working on a job."} />
            )}
            {items.length > 0 && <ConversationList items={items} selected={state.conversation} onSelect={jobId => setState({ conversation: jobId }, { push: true })} />}
          </div>
        </aside>

        <div className={cx("min-h-0 min-w-0 flex-1", state.conversation ? "flex" : "hidden md:flex")}>
          {selected ? (
            <div className="min-h-0 w-full"><ChatPane key={selected.jobId} conversation={selected} onBack={() => setState({ conversation: "" }, { push: true })} /></div>
          ) : state.conversation && conversations.isLoading ? (
            <div className="grid w-full place-items-center"><LoadingState label="Loading conversation" rows={3} /></div>
          ) : (
            <div className="grid w-full place-items-center p-6">
              <div className="text-center">
                <MessagesSquare aria-hidden className="mx-auto h-9 w-9 text-admin-muted" />
                <p className="mt-2 text-[15px] font-semibold text-admin-ink">{state.conversation ? "That conversation is not in this list" : "Select a conversation"}</p>
                <p className="mt-1 max-w-sm text-[13.5px] text-admin-ink-2">{state.conversation ? "It may be hidden by a filter, or the job has no assigned driver yet." : "Choose a job on the left to see what the driver has recorded and to message them. Use the arrow keys in the list, / to search, Escape to close a chat."}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
