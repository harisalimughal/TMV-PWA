/** Notifications and GPSLive alerts, with the previous dashboard filter options. */
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Activity, AlertTriangle, Bell, Car, EyeOff, HelpCircle, LogIn, LogOut, Mail, Radio, Send, ShieldAlert, Smartphone } from "lucide-react";
import { dismissAlerts, dismissNotifications, fetchAlerts, fetchNotifications, type AlertCategory, type AlertRow, type NotificationRow } from "../api";
import { useUrlState } from "../hooks/useUrlState";
import { usePushNotifications } from "../../../../lib/pwa/usePushNotifications";
import { DateRangePicker, defaultDashboardDateRange } from "../components/DateRangePicker";
import { BulkDismissModal } from "../components/BulkDismissModal";
import { activityHref } from "../activityLinks";
import { SendBroadcastPushModal } from "../components/SendBroadcastPushModal";
import { openJob, navigateTo } from "../navigation";
import { formatDateTime, formatShortDateTime, plural } from "../utils/format";
import { parseTrackerTime } from "../utils/freshness";
import { getAvatarColor } from "../utils/drivers";
import {
  Action, Badge, ChoiceChips, EmptyState, ErrorState, LoadingState, Missing, Notice, PageHeader, Pagination, SearchField, Tabs, Toolbar, panel, type Tone
} from "../components/ds";
import { cx } from "../../../../ui/cx";

type View = "fleet" | "delivery";

export function AlertsCenterPage({ onSelectSection }: { onSelectSection?: (id: string, params?: Record<string, string | undefined>) => void }) {
  const [initialRange] = useState(defaultDashboardDateRange);
  const [state, setState] = useUrlState({ view: "delivery", q: "", status: "all", category: "all", from: initialRange.from!, to: initialRange.to!, page: "1", compose: "", msgDriver: "", msgJob: "" });
  // Keep supplied UI deep links working while exposing just the two requested tabs.
  const view: View = state.view === "fleet" || state.view === "alerts" ? "fleet" : "delivery";
  const push = usePushNotifications();
  const queryClient = useQueryClient();
  const [broadcast, setBroadcast] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const enableAlerts = async () => {
    if (enabling || push.isLoading) return;
    setEnabling(true);
    setPushFeedback(null);
    try {
      const ok = await push.subscribe();
      setPushFeedback({ ok, text: ok ? "Device alerts enabled. This browser is subscribed." : "Device alerts could not be enabled. Allow notifications in your browser settings, check your connection and reload the app before retrying." });
    } catch {
      setPushFeedback({ ok: false, text: "Device alerts could not be enabled. Check your connection and try again." });
    } finally { setEnabling(false); }
  };
  // "Message driver" from Activity arrives here locked to one driver and one job.
  const direct = state.compose === "driver" && state.msgDriver && state.msgJob ? { driver: state.msgDriver, jobId: state.msgJob } : null;
  const go = (next: View, extra: Partial<typeof state> = {}) => setState({ view: next, q: "", status: "all", category: "all", page: "1", ...extra }, { push: true });

  return (
    <>
      <PageHeader title="Notifications & Alerts" scope="Customer notifications and GPSLive alerts" />
      <section aria-label="PWA Push Notification System" className={cx(panel, "flex flex-wrap items-center gap-4 p-4 sm:p-5")}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-admin-brand/25 bg-admin-brand-soft text-admin-brand"><Radio aria-hidden className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1 basis-[300px]">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold">PWA Push Notification System</h2>
            <span role="status" className={cx("rounded-full border px-2 py-0.5 text-[10px] font-medium", push.isSubscribed ? "border-admin-status-green/25 bg-admin-status-green-bg text-admin-status-green" : "border-admin-line bg-admin-surface text-admin-ink-2")}>
              This Device: {push.isSubscribed ? "Subscribed" : !push.isSupported ? "Not Supported" : push.permission === "denied" ? "Blocked" : "Not Subscribed"}
            </span>
          </div>
          <p className="mt-1 max-w-[640px] text-[12px] leading-relaxed text-admin-ink-2">Web Push allows dispatching real-time notifications to driver phones and admin screens even when the app is closed. Compatible with Android and iOS 16.4+.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Action size="sm" icon={<Bell />} className="border-admin-brand/25 bg-admin-brand-soft text-admin-brand" loading={enabling || push.isLoading} disabled={!push.isSupported || push.isSubscribed || push.permission === "denied"} onClick={() => void enableAlerts()}>{push.isSubscribed ? "Device Alerts Enabled" : "Enable Device Alerts"}</Action>
          <Action size="sm" icon={<Send />} onClick={() => setBroadcast(true)}>Broadcast Notice</Action>
        </div>
      </section>
      {!push.isSupported && <Notice tone="info">This browser doesn't support Web Push. On iPhone or iPad, use iOS 16.4 or later and open the app from your Home Screen.</Notice>}
      {push.permission === "denied" && <Notice tone="warning">Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page.</Notice>}
      {pushFeedback && <p role={pushFeedback.ok ? "status" : "alert"} className={cx("text-[13px]", pushFeedback.ok ? "text-admin-status-green" : "text-admin-status-red")}>{pushFeedback.text}</p>}
      <Tabs variant="underline" label="Notifications and alerts views" idBase="alerts" value={view} onChange={next => go(next)}
        tabs={[{ id: "delivery", label: "Notifications" }, { id: "fleet", label: "Alerts" }]} />
      <div role="tabpanel" id={`alerts-panel-${view}`} aria-labelledby={`alerts-tab-${view}`} className="space-y-4">
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

/* ------------------------------------------------------------ fleet events --- */

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
  const effectiveRange = useMemo(() => ranged ? { from: state.from || undefined, to: state.to || undefined } : state.category !== "all" ? { from: DateTime.now().minus({ days: 365 }).toISO()!, to: DateTime.now().toISO()! } : {}, [ranged, state.from, state.to, state.category]);
  const query = useQuery({ queryKey: ["gpslive_alerts", effectiveRange.from, effectiveRange.to], queryFn: () => fetchAlerts(effectiveRange.from, effectiveRange.to), refetchInterval: effectiveRange.from || effectiveRange.to ? false : 30000 });
  const rows = query.data?.rows ?? [];
  const needle = state.q.trim().toLowerCase();
  const filtered = rows.filter(row => (state.category === "all" || row.category === state.category) && (!needle || [row.description, row.deviceName, row.driverName].some(value => (value || "").toLowerCase().includes(needle))));
  const toggle = (ids: string[]) => setSelected(previous => { const next = new Set(previous); const all = ids.every(id => next.has(id)); ids.forEach(id => all ? next.delete(id) : next.add(id)); return next; });
  return (
    <>
      <Toolbar count={query.data ? plural(filtered.length, "event") : undefined}
        activeFilters={[...(state.category !== "all" ? [{ id: "category", label: `Type: ${CATEGORY_NAME[state.category as AlertCategory]}`, onRemove: () => setState({ category: "all" }) }] : []), ...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => setState({ q: "" }) }] : [])]}
        onClearFilters={() => setState({ category: "all", q: "" })}
        actions={selected.size > 0 ? <Action size="sm" icon={<EyeOff />} onClick={() => setConfirm(true)}>Hide {selected.size} selected</Action> : undefined}>
        <DateRangePicker presets="records" allowAll from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "" })} />
        <ChoiceChips label="Event type" value={state.category} onChange={category => setState({ category })} options={[{ value: "all", label: "All" }, { value: "congestion", label: "Congestion" }, { value: "tunnel", label: "Tunnel" }]} />
        <SearchField label="Search fleet events" placeholder="Place, vehicle or driver" value={state.q} onChange={q => setState({ q })} />
      </Toolbar>
      <p className="text-[13px] text-admin-ink-2">{ranged ? "Every GPSLive alert for the selected range." : state.category !== "all" ? `${CATEGORY_NAME[state.category as AlertCategory]} events from the last 365 days.` : "GPSLive's latest 50 fleet events, refreshed every 30 seconds. Choose a date range to search history."} Zone entries are road-charge evidence; review their fees in each driver's report.</p>
      <section className={cx(panel, "overflow-hidden")} aria-label="Fleet events">
        {query.isLoading ? <LoadingState label="Loading fleet events" />
          : query.isError ? <ErrorState title="Couldn't load fleet events" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
          : filtered.length === 0 ? <EmptyState kind={rows.length ? "no-matches" : "empty"} title={rows.length ? "No events match these filters" : "No fleet events in this period"} actions={rows.length ? <Action onClick={() => setState({ category: "all", q: "" })}>Clear filters</Action> : undefined} />
          : (
            <div className="overflow-x-auto">
              <table aria-label="Alerts" className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-[12px] text-admin-ink-2">
                  <th className="w-10 px-4 py-3 text-center"><input type="checkbox" aria-label="Select all alerts" checked={filtered.every(row => selected.has(row.eventId))} onChange={() => toggle(filtered.map(row => row.eventId))} className="h-3.5 w-3.5 accent-admin-brand" /></th>
                  {["Category", "Event", "Location / rule", "Van", "Driver", "Detected (UK)"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-admin-line">
                  {filtered.map(row => {
                    const detected = parseTrackerTime(row.detectedAt);
                    const categoryIcon = row.category === "congestion" ? <ShieldAlert /> : row.category === "tunnel" ? <Car /> : <HelpCircle />;
                    const kind = (row.type || "").toLowerCase();
                    const entering = ["zone_in", "geofence_in"].includes(kind), leaving = ["zone_out", "geofence_out"].includes(kind);
                    return <tr key={row.eventId} className="hover:bg-admin-surface/40">
                      <td className="px-4 text-center"><input type="checkbox" aria-label={`Select alert ${row.eventId}`} checked={selected.has(row.eventId)} onChange={() => toggle([row.eventId])} className="h-3.5 w-3.5 accent-admin-brand" /></td>
                      <td className="px-4 py-3"><span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide [&>svg]:h-3 [&>svg]:w-3", row.category === "congestion" ? "bg-admin-status-red-bg text-admin-status-red" : row.category === "tunnel" ? "bg-amber-100 text-amber-700" : "bg-admin-surface text-admin-ink-2")}>{categoryIcon}{CATEGORY_NAME[row.category]}</span></td>
                      <td className="px-4 py-3"><span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold [&>svg]:h-3 [&>svg]:w-3", entering ? "bg-admin-status-red-bg text-admin-status-red" : leaving ? "bg-admin-status-green-bg text-admin-status-green" : "bg-admin-surface text-admin-ink-2")}>{entering ? <LogIn /> : leaving ? <LogOut /> : <Activity />}{eventLabel(row.type)}</span></td>
                      <td className="px-4 py-3">{cleanDescription(row.description) || <Missing />}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px]">{row.deviceName || <Missing />}</td>
                      <td className="px-4 py-3">{row.driverInitials ? <div className="flex items-center gap-2 whitespace-nowrap"><span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", getAvatarColor(row.driverInitials))}>{row.driverInitials}</span><span>{row.driverName || row.driverInitials}</span></div> : row.driverName || <Missing>No driver linked</Missing>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] tabular-nums text-admin-ink-2">{detected ? detected.setZone("Europe/London").toFormat("dd/MM/yy · HH:mm") : row.detectedAt}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
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

function DeliveryStatus({ channel }: { channel: NotificationRow["email"] }) {
  const state = channel?.state;
  const label = state === "skipped" ? "No target" : DELIVERY[state]?.label || "Unknown";
  return <span title={[channel?.at ? formatDateTime(channel.at) : "", channel?.detail].filter(Boolean).join(" · ") || undefined}
    className={cx("inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide", state === "sent" ? "bg-admin-status-green-bg text-admin-status-green" : state === "failed" ? "bg-admin-status-red-bg text-admin-status-red" : state === "pending" ? "bg-amber-100 text-amber-700" : "bg-admin-surface text-admin-ink-2")}>
    {label}{channel?.detail && <span className="sr-only"> · {channel.detail}</span>}
  </span>;
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
        <DateRangePicker presets="records" allowAll from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "", page: "1" })} />
        <ChoiceChips label="Delivery status" value={state.status} onChange={status => setState({ status, page: "1" })}
          options={[{ value: "all", label: "All" }, { value: "sent", label: "Sent" }, { value: "failed", label: "Failed", count: count("failed") }, { value: "pending", label: "Pending", count: count("pending") }]} />
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
              <table aria-label="Notifications" className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
                <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-[12px] text-admin-ink-2">
                  <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all rows on this page" checked={pageRows.every(row => selected.has(row.jobId))} onChange={() => setSelected(previous => { const next = new Set(previous); const all = pageRows.every(row => next.has(row.jobId)); pageRows.forEach(row => all ? next.delete(row.jobId) : next.add(row.jobId)); return next; })} className="h-3.5 w-3.5 accent-admin-brand" /></th>
                  {["Job ID", "Customer", "Driver", "Started (UK)", "Email Target", "Email Status", "SMS Target", "SMS Status"].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-admin-line">
                  {pageRows.map(row => (
                    <tr key={row.jobId} className="hover:bg-admin-surface/40">
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${row.jobId}`} checked={selected.has(row.jobId)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(row.jobId)) next.delete(row.jobId); else next.add(row.jobId); return next; })} className="h-3.5 w-3.5 accent-admin-brand" /></td>
                      <td className="px-4 py-3"><button type="button" className="max-w-[115px] break-all text-left text-[12px] font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-admin-brand" onClick={() => openJob(row.jobId)} aria-label={`Open job ${row.jobId}`}>{row.jobId}</button></td>
                      <td className="max-w-[180px] px-4 py-3"><span className="block truncate" title={row.customerName || undefined}>{row.customerName || <Missing />}</span></td>
                      <td className="px-4 py-3">{row.driverInitials ? <span title={`Driver ${row.driverInitials}`} className={cx("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold", getAvatarColor(row.driverInitials))}>{row.driverInitials}</span> : <Missing />}</td>
                      <td className="max-w-[100px] px-4 py-3 text-[12px] tabular-nums text-admin-ink-2">{row.actualStart ? DateTime.fromISO(row.actualStart).setZone("Europe/London").toFormat("dd/MM/yy · HH:mm") : <Missing />}</td>
                      <td className="max-w-[240px] px-4 py-3 text-[12px]">{row.customerEmail ? <span className="flex min-w-0 items-center gap-1.5"><Mail aria-hidden className="h-3.5 w-3.5 shrink-0 text-admin-ink-2" /><span className="truncate" title={row.customerEmail}>{row.customerEmail}</span></span> : <Missing>No email</Missing>}</td>
                      <td className="px-4 py-3"><DeliveryStatus channel={row.email} /></td>
                      <td className="max-w-[230px] px-4 py-3 text-[12px]"><span className="flex items-center gap-1.5 break-all"><Smartphone aria-hidden className="h-3.5 w-3.5 shrink-0 text-admin-ink-2" /><SmsTarget phone={row.customerPhone} /></span></td>
                      <td className="px-4 py-3"><DeliveryStatus channel={row.sms} /></td>
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
