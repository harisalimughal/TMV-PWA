/**
 * Alerts: operational issues first, then the raw feeds behind them (audit p.19).
 *
 * - Needs attention: the shared `useAttention` list (same source as the header bell
 *   and the Overview), grouped by category, each with time, severity, reason,
 *   related driver/vehicle/job and a next action.
 * - Fleet events: GPSLive's alert feed (zone entries, safety events), with repeats grouped.
 * - Delivery log: customer email/SMS delivery states. Only Pending / Sent / Failed are
 *   shown -- the provider data has no delivered/read evidence, so neither is claimed.
 *
 * Device push setup moved to Settings / Notifications; only a short notice remains here.
 * Every view distinguishes "could not load" from "nothing to show".
 */
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { AlertTriangle, Bell, EyeOff, Send } from "lucide-react";
import { dismissAlerts, dismissNotifications, fetchAlerts, fetchNotifications, type AlertCategory, type AlertRow, type NotificationRow } from "../api";
import { useAttention, CATEGORY_LABEL, type AttentionItem } from "../hooks/useAttention";
import { useUrlState } from "../hooks/useUrlState";
import { usePushNotifications } from "../../../../lib/pwa/usePushNotifications";
import { AttentionList } from "../components/AttentionList";
import { DateRangePicker } from "../components/DateRangePicker";
import { BulkDismissModal } from "../components/BulkDismissModal";
import { activityHref } from "../activityLinks";
import { SendBroadcastPushModal } from "../components/SendBroadcastPushModal";
import { openJob, navigateTo, sectionHref } from "../navigation";
import { formatDateTime, formatShortDateTime, plural } from "../utils/format";
import { parseTrackerTime } from "../utils/freshness";
import {
  Action, Badge, ChoiceChips, EmptyState, ErrorState, LoadingState, Missing, Notice, PageHeader, Pagination, SearchField, Section, Tabs, Toolbar, panel, type Tone
} from "../components/ds";
import { cx } from "../../../../ui/cx";

type View = "attention" | "fleet" | "delivery";

export function AlertsCenterPage({ onSelectSection }: { onSelectSection?: (id: string, params?: Record<string, string | undefined>) => void }) {
  const [state, setState] = useUrlState({ view: "attention", q: "", status: "all", category: "all", from: "", to: "", page: "1", compose: "", msgDriver: "", msgJob: "" });
  const view = (["attention", "fleet", "delivery"].includes(state.view) ? state.view : "attention") as View;
  const attention = useAttention();
  const push = usePushNotifications();
  const queryClient = useQueryClient();
  const [broadcast, setBroadcast] = useState(false);
  // "Message driver" from Activity arrives here locked to one driver and one job.
  const direct = state.compose === "driver" && state.msgDriver && state.msgJob ? { driver: state.msgDriver, jobId: state.msgJob } : null;
  const go = (next: View, extra: Partial<typeof state> = {}) => setState({ view: next, q: "", status: "all", category: "all", page: "1", ...extra }, { push: true });

  const act = (item: AttentionItem) => {
    if (item.action.kind === "job" && item.action.target) openJob(item.action.target);
    else if (item.action.kind === "fleet") navigateTo(sectionHref("livefleet", { vehicle: item.action.target }));
    else if (item.action.kind === "delivery") go("delivery", { q: item.action.target ?? "" });
    else go("fleet");
  };

  return (
    <>
      <PageHeader title="Alerts & messages" scope={attention.lastUpdated ? `Last updated ${DateTime.fromMillis(attention.lastUpdated).setZone("Europe/London").toFormat("HH:mm")} · London time` : "Operational issues and message delivery"}
        actions={<>
          {push.isSupported && !push.isSubscribed && <Action variant="ghost" icon={<Bell />} loading={push.isLoading} onClick={() => void push.subscribe()}>Enable Device Alerts</Action>}
          <Action icon={<Send />} onClick={() => setBroadcast(true)}>Broadcast Notice</Action>
        </>} />
      {push.isSupported && !push.isSubscribed && (
        <Notice tone="info" action={<Action size="sm" onClick={() => onSelectSection?.("settings", { tab: "notifications" })}>Set up</Action>}>
          Alerts aren't pushed to this browser. Turn on device notifications in Settings to be notified when you're away from this page.
        </Notice>
      )}
      <Tabs label="Alert views" idBase="alerts" value={view} onChange={next => go(next)}
        tabs={[
          { id: "attention", label: "Needs attention", badge: attention.items.length ? <span className="rounded-full bg-admin-status-amber-bg px-1.5 text-[12px] tabular-nums text-admin-status-amber">{attention.items.length}</span> : undefined },
          { id: "fleet", label: "Fleet events" },
          { id: "delivery", label: "Delivery log" }
        ]} />
      <div role="tabpanel" id={`alerts-panel-${view}`} aria-labelledby={`alerts-tab-${view}`} className="space-y-4">
        {view === "attention" && <NeedsAttentionView attention={attention} onAction={act} />}
        {view === "fleet" && <FleetEventsView state={state} setState={setState} />}
        {view === "delivery" && <DeliveryLogView state={state} setState={setState} />}
      </div>
      <SendBroadcastPushModal isOpen={broadcast} onClose={() => setBroadcast(false)} />
      {direct && (
        <SendBroadcastPushModal key={`${direct.driver}:${direct.jobId}`} isOpen direct={direct}
          onClose={() => navigateTo(activityHref(direct.jobId))} onSent={() => { void queryClient.invalidateQueries({ queryKey: ["activity"] }); }} />
      )}
    </>
  );
}

function NeedsAttentionView({ attention, onAction }: { attention: ReturnType<typeof useAttention>; onAction: (item: AttentionItem) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, AttentionItem[]>();
    for (const item of attention.items) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return Array.from(map.entries());
  }, [attention.items]);
  return (
    <>
      <div className={cx(panel, "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]")}>
        <span className="font-semibold">Sources</span>
        {attention.sources.map(source => (
          <span key={source.id} className="inline-flex items-center gap-1.5">
            <Badge tone={source.status === "ok" ? "success" : source.status === "loading" ? "neutral" : "danger"}>{source.status === "ok" ? "Loaded" : source.status === "loading" ? "Loading" : "Failed"}</Badge>{source.label}
          </span>
        ))}
        <Action size="sm" className="ml-auto" onClick={attention.refetch}>Refresh</Action>
      </div>
      {attention.failed.length > 0 && <Notice tone="danger" title="Some sources couldn't load" action={<Action size="sm" onClick={attention.refetch}>Retry</Action>}>{attention.failed.map(source => `${source.label}${source.error ? ` (${source.error})` : ""}`).join("; ")}. Issues from them are missing below — this is not an all-clear.</Notice>}
      {attention.jobsTruncated && <Notice tone="info">Only the first 100 of today's jobs were checked.</Notice>}
      {attention.loading && !attention.items.length ? <div className={panel}><LoadingState label="Checking for issues" /></div>
        : !attention.items.length ? <div className={panel}><EmptyState title={attention.failed.length ? "Nothing found in the sources that loaded" : "Nothing needs attention"} message="Today's jobs, live trackers, message delivery and fleet safety events were checked." /></div>
        : groups.map(([category, items]) => (
          <Section key={category} title={`${CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]} (${items.length})`}>
            <AttentionList items={items} onAction={onAction} />
          </Section>
        ))}
    </>
  );
}

/* ------------------------------------------------------------ fleet events --- */

const CATEGORY_TONE: Record<AlertCategory, Tone> = { congestion: "info", tunnel: "info", other: "neutral" };
const CATEGORY_NAME: Record<AlertCategory, string> = { congestion: "Congestion", tunnel: "Tunnel", other: "Other" };

export function eventLabel(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "zone_in" || t === "geofence_in") return "Entered zone";
  if (t === "zone_out" || t === "geofence_out") return "Left zone";
  const known: Record<string, string> = { moving: "Started moving", stopped: "Stopped", idle: "Idling", ignition_on: "Ignition on", engine_on: "Ignition on", ignition_off: "Ignition off", engine_off: "Ignition off", overspeed: "Overspeed", speed: "Overspeed", sos: "SOS pressed", panic: "SOS pressed" };
  return known[t] || (type ? type.replace(/[_-]+/g, " ").replace(/^\w/, c => c.toUpperCase()) : "Event");
}

function cleanDescription(text: string): string {
  let value = (text || "").replace(/^\s*charges\s*[-–]\s*alerts\s*/i, "").trim();
  const paren = value.match(/^\((.+)\)$/);
  if (paren) value = paren[1].trim();
  return value.replace(/^\w/, c => c.toUpperCase());
}

/** Consecutive identical events (same vehicle, type and place) collapse into one row. */
export function groupEvents(rows: AlertRow[]): Array<{ key: string; rows: AlertRow[] }> {
  const groups: Array<{ key: string; rows: AlertRow[] }> = [];
  for (const row of rows) {
    const key = `${row.deviceName}|${row.type}|${row.description}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row); else groups.push({ key, rows: [row] });
  }
  return groups;
}

type AlertState = { view: string; q: string; status: string; category: string; from: string; to: string; page: string };

function FleetEventsView({ state, setState }: { state: AlertState; setState: (patch: Partial<AlertState>) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const ranged = !!(state.from || state.to);
  const query = useQuery({ queryKey: ["gpslive_alerts", state.from || undefined, state.to || undefined], queryFn: () => fetchAlerts(state.from || undefined, state.to || undefined), refetchInterval: ranged ? false : 30000 });
  const rows = query.data?.rows ?? [];
  const needle = state.q.trim().toLowerCase();
  const filtered = rows.filter(row => (state.category === "all" || row.category === state.category) && (!needle || [row.description, row.deviceName, row.driverName].some(value => (value || "").toLowerCase().includes(needle))));
  const groups = groupEvents(filtered);
  const toggle = (ids: string[]) => setSelected(previous => { const next = new Set(previous); const all = ids.every(id => next.has(id)); ids.forEach(id => all ? next.delete(id) : next.add(id)); return next; });
  return (
    <>
      <Toolbar count={query.data ? `${plural(filtered.length, "event")}${groups.length !== filtered.length ? ` in ${groups.length} groups` : ""}` : undefined}
        activeFilters={[...(state.category !== "all" ? [{ id: "category", label: `Type: ${CATEGORY_NAME[state.category as AlertCategory]}`, onRemove: () => setState({ category: "all" }) }] : []), ...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => setState({ q: "" }) }] : [])]}
        onClearFilters={() => setState({ category: "all", q: "" })}
        actions={selected.size > 0 ? <Action size="sm" icon={<EyeOff />} onClick={() => setConfirm(true)}>Hide {selected.size} selected</Action> : undefined}>
        <DateRangePicker presets="retrospective" allowAll from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "" })} />
        <ChoiceChips label="Event type" value={state.category} onChange={category => setState({ category })} options={[{ value: "all", label: "All" }, { value: "congestion", label: "Congestion" }, { value: "tunnel", label: "Tunnel" }, { value: "other", label: "Other" }]} />
        <SearchField label="Search fleet events" placeholder="Place, vehicle or driver" value={state.q} onChange={q => setState({ q })} />
      </Toolbar>
      <p className="text-[13px] text-admin-ink-2">{ranged ? "Every GPSLive alert for the selected range." : "GPSLive's latest 50 fleet events, refreshed every 30 seconds. Choose a date range to search history."} Zone entries are road-charge evidence; review their fees in each driver's report.</p>
      <section className={cx(panel, "overflow-hidden")} aria-label="Fleet events">
        {query.isLoading ? <LoadingState label="Loading fleet events" />
          : query.isError ? <ErrorState title="Couldn't load fleet events" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
          : groups.length === 0 ? <EmptyState kind={rows.length ? "no-matches" : "empty"} title={rows.length ? "No events match these filters" : "No fleet events in this period"} actions={rows.length ? <Action onClick={() => setState({ category: "all", q: "" })}>Clear filters</Action> : undefined} />
          : (
            <ul className="divide-y divide-admin-line">
              {groups.map(group => {
                const first = group.rows[0];
                const ids = group.rows.map(row => row.eventId);
                const latest = parseTrackerTime(first.detectedAt);
                return (
                  <li key={first.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:flex-nowrap">
                    <input type="checkbox" aria-label={`Select ${eventLabel(first.type)} ${first.deviceName || ""}`} checked={ids.every(id => selected.has(id))} onChange={() => toggle(ids)} className="h-4 w-4 accent-admin-brand" />
                    <Badge tone={CATEGORY_TONE[first.category]}>{CATEGORY_NAME[first.category]}</Badge>
                    <div className="min-w-0 flex-1 basis-[220px]">
                      <p className="truncate text-[14px] font-semibold">{eventLabel(first.type)} · {cleanDescription(first.description) || "No location"}{group.rows.length > 1 && <span className="font-normal text-admin-ink-2"> · {group.rows.length} times</span>}</p>
                      <p className="truncate text-[13px] text-admin-ink-2">{first.deviceName || "Unknown vehicle"} · {first.driverName || "No driver linked"}</p>
                    </div>
                    <span className="shrink-0 text-[13px] tabular-nums text-admin-ink-2">{latest ? formatShortDateTime(latest.toISO()) : first.detectedAt}</span>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
      {confirm && <BulkDismissModal count={selected.size} itemLabel="fleet event" onClose={() => setConfirm(false)} onConfirm={async () => { await dismissAlerts(Array.from(selected)); setConfirm(false); setSelected(new Set()); void query.refetch(); }} />}
    </>
  );
}

/* ------------------------------------------------------------ delivery log --- */

const DELIVERY: Record<NotificationRow["email"]["state"], { label: string; tone: Tone }> = {
  sent: { label: "Sent", tone: "success" }, failed: { label: "Failed", tone: "danger" }, pending: { label: "Pending", tone: "warning" },
  skipped: { label: "No contact on file", tone: "neutral" }, disabled: { label: "Channel off", tone: "neutral" }
};

/** UK numbers shown as 07xxx xxxxxx; anything too short to dial is flagged rather than shown as fine. */
export function normalizePhone(phone?: string): { formatted: string; invalid: boolean } {
  if (!phone) return { formatted: "", invalid: true };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { formatted: phone, invalid: true };
  if (digits.startsWith("447") && digits.length === 12) return { formatted: `0${digits.slice(2, 6)} ${digits.slice(6)}`, invalid: false };
  if (digits.startsWith("07") && digits.length === 11) return { formatted: `${digits.slice(0, 5)} ${digits.slice(5)}`, invalid: false };
  return { formatted: phone, invalid: false };
}

function SmsTarget({ phone }: { phone?: string }) {
  const info = normalizePhone(phone);
  if (!phone) return <Missing>No phone on file</Missing>;
  return info.invalid
    ? <span className="inline-flex items-center gap-1 text-admin-status-amber"><AlertTriangle aria-hidden className="h-3.5 w-3.5" />{info.formatted}<span className="sr-only"> (not a dialable number)</span></span>
    : <span className="font-mono tabular-nums">{info.formatted}</span>;
}

function DeliveryCell({ channel, target }: { channel: NotificationRow["email"]; target?: React.ReactNode }) {
  const meta = DELIVERY[channel?.state] ?? { label: "Unknown", tone: "neutral" as Tone };
  return <div className="min-w-0"><Badge tone={meta.tone}>{meta.label}</Badge>{target != null && <p className="mt-0.5 truncate text-[13px] text-admin-ink">{target}</p>}<p className="mt-0.5 truncate text-[12.5px] text-admin-ink-2" title={channel?.detail}>{channel?.at ? formatDateTime(channel.at) : ""}{channel?.detail ? `${channel?.at ? " · " : ""}${channel.detail}` : ""}</p></div>;
}

function DeliveryLogView({ state, setState }: { state: AlertState; setState: (patch: Partial<AlertState>) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications() });
  const rows = query.data?.rows ?? [];
  const needle = state.q.trim().toLowerCase();
  const filtered = rows.filter(row => {
    if (state.from && row.actualStart < state.from) return false;
    if (state.to && row.actualStart > state.to) return false;
    if (needle && ![row.jobId, row.customerName].some(value => (value || "").toLowerCase().includes(needle))) return false;
    if (state.status !== "all" && row.email.state !== state.status && row.sms.state !== state.status) return false;
    return true;
  });
  const page = Math.max(1, Number(state.page) || 1);
  const pageRows = filtered.slice((page - 1) * 25, page * 25);
  const count = (status: string) => rows.filter(row => row.email.state === status || row.sms.state === status).length;
  return (
    <>
      <Toolbar count={query.data ? plural(filtered.length, "job") : undefined}
        activeFilters={[...(state.status !== "all" ? [{ id: "status", label: `Status: ${DELIVERY[state.status as keyof typeof DELIVERY]?.label}`, onRemove: () => setState({ status: "all", page: "1" }) }] : []), ...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => setState({ q: "", page: "1" }) }] : [])]}
        onClearFilters={() => setState({ status: "all", q: "", page: "1" })}
        actions={<>{selected.size > 0 && <Action size="sm" icon={<EyeOff />} onClick={() => setConfirm(true)}>Hide {selected.size} selected</Action>}</>}>
        <DateRangePicker presets="retrospective" allowAll from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "", page: "1" })} />
        <ChoiceChips label="Delivery status" value={state.status} onChange={status => setState({ status, page: "1" })}
          options={[{ value: "all", label: "All" }, { value: "failed", label: "Failed", count: count("failed") }, { value: "pending", label: "Pending", count: count("pending") }, { value: "sent", label: "Sent" }]} />
        <SearchField label="Search delivery log" placeholder="Job ID or customer" value={state.q} onChange={q => setState({ q, page: "1" })} />
      </Toolbar>
      <p className="text-[13px] text-admin-ink-2">Customer email and SMS for each job. “Sent” means the provider accepted the message; delivery and read receipts aren't available, so they aren't shown.</p>
      <section className={cx(panel, "overflow-hidden")} aria-label="Delivery log">
        {query.isLoading ? <LoadingState label="Loading delivery log" />
          : query.isError ? <ErrorState title="Couldn't load the delivery log" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
          : pageRows.length === 0 ? <EmptyState kind={rows.length ? "no-matches" : "empty"} title={rows.length ? "No messages match these filters" : "No messages recorded"} actions={rows.length ? <Action onClick={() => setState({ status: "all", q: "", from: "", to: "", page: "1" })}>Clear filters</Action> : undefined} />
          : (
            <>
            <ul aria-label="Delivery log" className="m-0 list-none divide-y divide-admin-line p-0 md:hidden">
              {pageRows.map(row => (
                <li key={row.jobId} className="flex gap-3 p-4">
                  <input type="checkbox" aria-label={`Select ${row.jobId}`} checked={selected.has(row.jobId)} className="h-6 w-6 shrink-0 accent-admin-brand"
                    onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(row.jobId)) next.delete(row.jobId); else next.add(row.jobId); return next; })} />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Action size="sm" variant="ghost" className="-ml-2.5 max-w-full" onClick={() => openJob(row.jobId)} aria-label={`Open job ${row.jobId}`}>{row.customerName || row.jobId}</Action>
                        <p className="truncate text-[12.5px] text-admin-ink-2">{row.jobId}{row.driverInitials ? ` · Driver ${row.driverInitials}` : ""}</p>
                      </div>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-admin-ink-2">{row.actualStart ? formatShortDateTime(row.actualStart) : <Missing />}</span>
                    </div>
                    <div><p className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-2">Email</p><DeliveryCell channel={row.email} target={row.customerEmail ? <span title={row.customerEmail}>{row.customerEmail}</span> : <Missing>No email on file</Missing>} /></div>
                    <div><p className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-2">SMS</p><DeliveryCell channel={row.sms} target={<SmsTarget phone={row.customerPhone} />} /></div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-[14px]">
                <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-left text-[12.5px] text-admin-ink-2">
                  <th className="w-10 px-4 py-2"><input type="checkbox" aria-label="Select all rows on this page" checked={pageRows.every(row => selected.has(row.jobId))} onChange={() => setSelected(previous => { const next = new Set(previous); const all = pageRows.every(row => next.has(row.jobId)); pageRows.forEach(row => all ? next.delete(row.jobId) : next.add(row.jobId)); return next; })} className="h-4 w-4 accent-admin-brand" /></th>
                  <th className="px-3 py-2 font-semibold">Job</th><th className="px-3 py-2 font-semibold">Job start</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">SMS</th>
                </tr></thead>
                <tbody className="divide-y divide-admin-line">
                  {pageRows.map(row => (
                    <tr key={row.jobId}>
                      <td className="px-4 py-2"><input type="checkbox" aria-label={`Select ${row.jobId}`} checked={selected.has(row.jobId)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(row.jobId)) next.delete(row.jobId); else next.add(row.jobId); return next; })} className="h-4 w-4 accent-admin-brand" /></td>
                      <td className="px-3 py-2"><Action size="sm" variant="ghost" className="-ml-2.5" onClick={() => openJob(row.jobId)} aria-label={`Open job ${row.jobId}`}>{row.customerName || row.jobId}</Action><p className="text-[12.5px] text-admin-ink-2">{row.jobId}{row.driverInitials ? ` · Driver ${row.driverInitials}` : ""}</p></td>
                      <td className="px-3 py-2 tabular-nums">{row.actualStart ? formatDateTime(row.actualStart) : <Missing />}</td>
                      <td className="max-w-[260px] px-3 py-2"><DeliveryCell channel={row.email} target={row.customerEmail ? <span title={row.customerEmail}>{row.customerEmail}</span> : <Missing>No email on file</Missing>} /></td>
                      <td className="max-w-[260px] px-3 py-2"><DeliveryCell channel={row.sms} target={<SmsTarget phone={row.customerPhone} />} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        {query.data && <Pagination page={page} pageSize={25} total={filtered.length} noun="job" onPage={next => setState({ page: String(next) })} />}
      </section>
      {confirm && <BulkDismissModal count={selected.size} itemLabel="message row" onClose={() => setConfirm(false)} onConfirm={async () => { await dismissNotifications(Array.from(selected)); setConfirm(false); setSelected(new Set()); void query.refetch(); }} />}
    </>
  );
}
