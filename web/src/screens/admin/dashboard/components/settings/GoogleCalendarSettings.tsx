/**
 * Settings, Integrations, Google Calendar. TMV is the source of truth: events are written one way, from bookings to
 * the calendar, and nothing in the calendar is read back. The browser never sees Google tokens: "Connect" asks the
 * server for a sign-in address and goes there; the server keeps the credentials. Without a backend for this the
 * panel says so, and the explicit sample-data preview uses a SIMULATED connection (no Google account is contacted).
 */
import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, PlugZap, RefreshCw, Unplug } from "lucide-react";
import type { CalendarConfig } from "../../../../../lib/booking/calendar/types";
import { BookingUnavailableError, BookingWriteError } from "../../../../../lib/booking/client";
import { BookingSourceProvider, useBookingSource } from "../../bookings/source";
import { Action, Badge, EmptyState, ErrorState, LoadingState, Notice, Section, controlBase } from "../ds";
import { formatShortDateTime } from "../../utils/format";

type Draft = Pick<CalendarConfig, "enabled" | "calendarId" | "syncUnconfirmed" | "cancellation" | "format" | "include">;
const pick = (c: CalendarConfig): Draft => ({ enabled: c.enabled, calendarId: c.calendarId, syncUnconfirmed: c.syncUnconfirmed, cancellation: c.cancellation, format: c.format, include: { ...c.include } });

function Check({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-[rgb(var(--admin-brand,109_40_217))]" aria-describedby={hint ? `${id}-hint` : undefined} />
      <div><label htmlFor={id} className="text-[14px] font-medium text-admin-ink">{label}</label>{hint && <p id={`${id}-hint`} className="text-[12.5px] text-admin-ink-2">{hint}</p>}</div>
    </div>
  );
}

function Panel() {
  const { api, source, setSource } = useBookingSource();
  const client = useQueryClient();
  const key = ["gcal", source];
  const status = useQuery({
    queryKey: key, queryFn: ({ signal }) => api.calendarStatus(signal),
    retry: (count, error) => !(error instanceof BookingUnavailableError) && count < 1,
    refetchInterval: query => ((query.state.data?.health.pending ?? 0) > 0 ? 1500 : false)
  });
  const ops = useQuery({ queryKey: [...key, "ops"], queryFn: ({ signal }) => api.calendarOperations(signal), enabled: !!status.data });
  // The list follows the status: refetch whenever the status refreshes, so it can never be left showing a stale failure.
  const statusAt = status.dataUpdatedAt;
  const refetchOps = ops.refetch;
  useEffect(() => { if (statusAt) void refetchOps(); }, [statusAt, refetchOps]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const server = status.data?.config ? pick(status.data.config) : null;
  useEffect(() => { if (server && !draft) setDraft(server); }, [server, draft]);
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const dirty = !!(server && draft && JSON.stringify(server) !== JSON.stringify(draft));

  const connect = useMutation({ mutationFn: () => api.calendarConnect(), onSuccess: result => { if (result.authUrl) window.location.assign(result.authUrl); else { setDraft(null); void refresh(); } } });
  const disconnect = useMutation({ mutationFn: () => api.calendarDisconnect(), onSuccess: () => { setDraft(null); setNotice("Disconnected. Existing calendar events were left as they are."); void refresh(); } });
  const save = useMutation({
    mutationFn: (value: Draft) => api.calendarSave(value),
    onSuccess: () => { setErrors({}); setNotice("Settings saved."); setDraft(null); void refresh(); },
    onError: error => { if (error instanceof BookingWriteError) { setErrors(error.detail.fields ?? {}); setNotice(null); } }
  });
  const retry = useMutation({ mutationFn: (bookingId: string) => api.calendarRetry(bookingId), onSuccess: () => { void refresh(); void ops.refetch(); } });

  if (status.isPending) return <LoadingState label="Loading Google Calendar settings" rows={4} />;
  if (status.error instanceof BookingUnavailableError) {
    return (
      <EmptyState title="Google Calendar sync is not available on this server yet"
        message="The server has no calendar integration endpoints, so nothing can be connected or synchronised, and nothing is assumed. The existing calendar flow is unaffected. You can look at how this will work with clearly labelled sample data."
        actions={<Action variant="primary" onClick={() => setSource("preview")}>Explore with sample data</Action>} />
    );
  }
  if (status.isError || !status.data || !draft) return status.isError ? <ErrorState title="Couldn't load the calendar integration" message={(status.error as Error).message} onRetry={() => void status.refetch()} /> : <LoadingState label="Loading Google Calendar settings" rows={4} />;

  const s = status.data, connected = s.connection.state === "connected", needsReconnect = s.connection.state === "needs_reconnect";
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const inc = (patch: Partial<Draft["include"]>) => setDraft({ ...draft, include: { ...draft.include, ...patch } });
  const writable = connected;

  return (
    <div className="space-y-4">
      {(source === "preview" || s.simulated) && <Notice tone="warning" title="Sample data and a simulated connection" action={source === "preview" ? <Action onClick={() => { setSource("live"); setDraft(null); }}>Use live data</Action> : undefined}>No Google account is contacted and no real calendar is written. This shows how the integration behaves, using the real synchronisation logic against a stand-in calendar.</Notice>}
      {notice && <Notice tone="success" role="status">{notice}</Notice>}

      <Section id="gcal-connection" title="Connection" description="One Google account, used only to write booking events to one calendar.">
        <div className="space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={connected ? "success" : needsReconnect ? "danger" : "neutral"}>{connected ? "Connected" : needsReconnect ? "Needs reconnecting" : "Not connected"}</Badge>
            {s.connection.account && <span className="text-[14px] text-admin-ink">{s.connection.account}</span>}
            {s.connection.connectedAt && <span className="text-[13px] text-admin-ink-2">since {formatShortDateTime(s.connection.connectedAt)}</span>}
          </div>
          {needsReconnect && <Notice tone="danger" title="Google rejected the saved sign-in">Synchronisation is paused, and nothing is lost: changes wait and are applied after you reconnect.</Notice>}
          <div className="flex flex-wrap gap-2">
            {(!connected) && <Action variant="primary" icon={<PlugZap />} loading={connect.isPending} onClick={() => connect.mutate()}>{needsReconnect ? "Reconnect Google account" : "Connect Google account"}</Action>}
            {(connected || needsReconnect) && <Action icon={<Unplug />} loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</Action>}
          </div>
          <p className="text-[12.5px] text-admin-ink-2">Permissions requested: create and edit events, and list calendars so you can choose one. Nothing else. The sign-in is stored by the server, never in this browser.</p>
          {connect.isError && <p role="alert" className="text-[13px] text-admin-status-red">Could not start the connection. Try again.</p>}
        </div>
      </Section>

      <Section id="gcal-sync" title="Synchronisation" description="Which calendar, and whether bookings are written to it automatically.">
        <div className="space-y-4 p-4 md:p-5">
          <div className="grid gap-1.5 sm:max-w-sm">
            <label htmlFor="gcal-calendar" className="text-[14px] font-medium text-admin-ink">Calendar</label>
            <select id="gcal-calendar" className={controlBase} disabled={!writable} value={draft.calendarId ?? ""} onChange={event => set({ calendarId: event.target.value || null, ...(event.target.value ? {} : { enabled: false }) })} aria-invalid={!!errors.calendarId || undefined}>
              <option value="">{writable ? "Choose a calendar" : "Connect an account first"}</option>
              {s.calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.calendarId && <p role="alert" className="text-[12.5px] text-admin-status-red">{errors.calendarId}</p>}
          </div>
          <Check id="gcal-enabled" label="Synchronise bookings automatically" hint="When a booking is confirmed, changed or cancelled in TMV, the calendar event is created, updated or cancelled. A calendar problem never changes the booking." checked={draft.enabled} disabled={!writable || !draft.calendarId} onChange={value => set({ enabled: value })} />
          {errors.enabled && <p role="alert" className="text-[12.5px] text-admin-status-red">{errors.enabled}</p>}
          <Check id="gcal-unconfirmed" label="Also write unconfirmed bookings as tentative events" hint="Off by default. Enquiries are never written." checked={draft.syncUnconfirmed} disabled={!writable} onChange={value => set({ syncUnconfirmed: value })} />
        </div>
      </Section>

      <Section id="gcal-format" title="Event format and privacy" description="What anyone who can see the calendar will see. TMV's booking page holds the full details.">
        <fieldset disabled={!writable} className="space-y-4 p-4 md:p-5">
          <legend className="sr-only">Event format and privacy</legend>
          <div role="radiogroup" aria-label="Event format" className="space-y-2">
            <label className="flex items-start gap-2.5 text-[14px]"><input type="radio" name="gcal-format" className="h-6 w-6 shrink-0" checked={draft.format === "private"} onChange={() => set({ format: "private" })} /><span><span className="font-medium text-admin-ink">Private (recommended)</span><span className="block text-[12.5px] text-admin-ink-2">Title like "TMV-2044 · Large van · AR". No price in the title.</span></span></label>
            <label className="flex items-start gap-2.5 text-[14px]"><input type="radio" name="gcal-format" className="h-6 w-6 shrink-0" checked={draft.format === "compatible"} onChange={() => set({ format: "compatible" })} /><span><span className="font-medium text-admin-ink">Compatible with the existing sync (migration only)</span><span className="block text-[12.5px] text-admin-ink-2">Title like "2 Men - £170 - 09:00 / Y - AR". Needs a known price, so bookings without one are blocked rather than guessed. Not yet checked against the real parser. Do not use while the existing flow reads the same calendar.</span></span></label>
            {errors.format && <p role="alert" className="text-[12.5px] text-admin-status-red">{errors.format}</p>}
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Check id="gcal-name" label="Customer name" checked={draft.include.customerName} onChange={value => inc({ customerName: value })} />
            <Check id="gcal-phone" label="Customer phone" hint="Off by default." checked={draft.include.customerPhone} onChange={value => inc({ customerPhone: value })} />
            <Check id="gcal-email" label="Customer email" hint="Off by default." checked={draft.include.customerEmail} onChange={value => inc({ customerEmail: value })} />
            <Check id="gcal-driver" label="Assigned driver" checked={draft.include.driver} onChange={value => inc({ driver: value })} />
            <Check id="gcal-van" label="Van registration" checked={draft.include.vehicle} onChange={value => inc({ vehicle: value })} />
            <Check id="gcal-inventory" label="Inventory" hint="Off by default." checked={draft.include.inventory} onChange={value => inc({ inventory: value })} />
            <Check id="gcal-notes" label="Notes" hint="Off by default." checked={draft.include.notes} onChange={value => inc({ notes: value })} />
            <Check id="gcal-link" label="Link to the TMV booking" checked={draft.include.bookingLink} onChange={value => inc({ bookingLink: value })} />
          </div>
          <div className="grid gap-1.5 sm:max-w-sm">
            <label htmlFor="gcal-address" className="text-[14px] font-medium text-admin-ink">Addresses</label>
            <select id="gcal-address" className={controlBase} value={draft.include.addresses} onChange={event => inc({ addresses: event.target.value as Draft["include"]["addresses"] })}>
              <option value="postcode">Postcodes only (default)</option><option value="full">Full addresses</option><option value="none">None</option>
            </select>
          </div>
        </fieldset>
      </Section>

      <Section id="gcal-cancel" title="Cancellations" description="What happens to the calendar event when a booking is cancelled. TMV keeps its own history either way.">
        <div role="radiogroup" aria-label="Cancellation handling" className="space-y-2 p-4 md:p-5">
          <label className="flex items-start gap-2.5 text-[14px]"><input type="radio" name="gcal-cancel" className="h-6 w-6 shrink-0" disabled={!writable} checked={draft.cancellation === "mark_cancelled"} onChange={() => set({ cancellation: "mark_cancelled" })} /><span><span className="font-medium text-admin-ink">Mark the event as cancelled (default)</span><span className="block text-[12.5px] text-admin-ink-2">The event stays, titled "CANCELLED", and stops blocking time.</span></span></label>
          <label className="flex items-start gap-2.5 text-[14px]"><input type="radio" name="gcal-cancel" className="h-6 w-6 shrink-0" disabled={!writable} checked={draft.cancellation === "delete"} onChange={() => set({ cancellation: "delete" })} /><span><span className="font-medium text-admin-ink">Delete the event</span><span className="block text-[12.5px] text-admin-ink-2">Removes it from the calendar.</span></span></label>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Action variant="primary" disabled={!dirty || !writable} loading={save.isPending} onClick={() => save.mutate(draft)}>Save settings</Action>
        {dirty && <Action variant="ghost" onClick={() => { setDraft(server); setErrors({}); }}>Discard changes</Action>}
        {dirty && <span className="text-[13px] text-admin-ink-2">Unsaved changes</span>}
      </div>

      <Section id="gcal-health" title="Health" description="What the last synchronisations did.">
        <div className="space-y-3 p-4 md:p-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["In sync", s.health.synced], ["Waiting", s.health.pending], ["Failed", s.health.failed], ["Blocked", s.health.blocked]] as const).map(([label, value]) => <div key={label}><dt className="text-[12.5px] text-admin-ink-2">{label}</dt><dd className="text-[22px] font-semibold text-admin-ink">{value}</dd></div>)}
          </dl>
          <p className="text-[13px] text-admin-ink-2">Last successful write: {s.health.lastSyncAt ? `${formatShortDateTime(s.health.lastSyncAt)} (London)` : "none yet"}{s.health.nextRetryAt ? `. Next retry ${formatShortDateTime(s.health.nextRetryAt)}.` : "."}</p>
          {s.health.lastError && <p className="text-[13px] text-admin-ink">Latest problem: {s.health.lastError}</p>}
          <div>
            <h3 className="text-[14px] font-semibold text-admin-ink">Operations needing attention</h3>
            {ops.isPending ? <LoadingState label="Loading operations" rows={2} /> : !ops.data?.length ? <p className="mt-1 text-[13px] text-admin-ink-2">Nothing is waiting or failed.</p> : (
              <ul className="mt-2 divide-y divide-admin-line rounded-xl border border-admin-line">
                {ops.data.map(row => (
                  <li key={row.bookingId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0"><p className="text-[14px] font-medium text-admin-ink">{row.reference} <Badge tone={row.status === "failed" ? "danger" : row.status === "blocked" ? "warning" : "neutral"}>{row.status === "pending" ? "Waiting" : row.status === "failed" ? "Failed" : "Blocked"}</Badge></p><p className="text-[12.5px] text-admin-ink-2">{row.message ?? "Waiting for synchronisation."}{row.attempts ? ` Attempts: ${row.attempts}.` : ""}</p></div>
                    {row.status !== "blocked" && <Action size="sm" icon={<RefreshCw />} disabled={retry.isPending} aria-label={`Retry ${row.reference}`} onClick={() => retry.mutate(row.bookingId)}>Retry</Action>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Notice tone="info" title="The existing calendar flow is not changed">This integration does not turn off or replace anything. Point it at a separate calendar until the existing flow has been checked, so the two cannot create the same event twice. Changes made directly in Google Calendar are not read back.</Notice>
    </div>
  );
}

export function GoogleCalendarSettings() {
  return <BookingSourceProvider><div className="space-y-2"><div className="flex items-center gap-2 text-admin-ink"><CalendarSync aria-hidden className="h-5 w-5" /><h2 className="text-[17px] font-semibold">Google Calendar</h2></div><Panel /></div></BookingSourceProvider>;
}
