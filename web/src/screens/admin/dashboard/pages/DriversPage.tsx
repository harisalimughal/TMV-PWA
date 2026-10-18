/**
 * Drivers has two tabs: Drivers (manage and inspect individual drivers, as cards or as a
 * table) and Performance (compare drivers over a period). A driver's full report, with
 * its six tabs, stays one click away.
 *
 * URL: `view=drivers|performance` and `mode=cards|table`. The old three-tab values still
 * work: `view=cards` opens Drivers as cards, `view=directory` opens Drivers as a table.
 *
 * The table is the account roster and is never date-filtered; the date range applies to
 * the cards and the performance tab.
 * "Account active" means app sign-in is enabled. It does not mean online, driving,
 * available or assigned; current work is shown separately from today's jobs.
 */
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LayoutGrid, List, MoreHorizontal, Plus, UserCheck, UserX, Trash2, Pencil } from "lucide-react";
import { fetchDrivers as fetchDriverRoster, type AdminDriver } from "../../../../api/admin";
import { deleteDriver, saveDriver } from "../api";
import type { NormalizedJob } from "../types";
import { AddDriverModal, type DriverEditTarget } from "../components/AddDriverModal";
import { GenerateReportModal } from "../reports/GenerateReportModal";
import { DriverPerformanceSummary } from "../components/DriverPerformanceSummary";
import { DriverCards } from "../components/DriverCards";
import { DateRangePicker } from "../components/DateRangePicker";
import { DRIVER_OPTIONS_QUERY_KEY } from "../hooks/useDriverOptions";
import { useUrlState } from "../hooks/useUrlState";
import { useTodayJobs } from "../hooks/useAttention";
import { openJob } from "../navigation";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { driverReportHref, navigateAdmin } from "../utils/reportNavigation";
import { formatDateTime, formatTime, plural } from "../utils/format";
import { formatVanReg } from "../utils/drivers";
import { Menu } from "../../../../ui/Menu";
import { Modal } from "../../../../ui/Modal";
import {
  Action, Badge, CellStack, DataTable, Drawer, focusRing, EmptyState, ErrorState, Facts, LoadingState, Missing, Notice, PageHeader, SearchField, Tabs, Toolbar, controlBase, panel, type Column
} from "../components/ds";
import { cx } from "../../../../ui/cx";

type View = "drivers" | "performance";
type Mode = "cards" | "table";

/** Maps the URL (current and legacy values) onto the two tabs and the two modes. */
export function driversLocation(view: string, mode: string): { view: View; mode: Mode } {
  if (view === "performance") return { view: "performance", mode: mode === "table" ? "table" : "cards" };
  return { view: "drivers", mode: mode === "table" || view === "directory" ? "table" : "cards" };
}

/** What a driver is doing today, from today's jobs only. */
export function currentWork(initials: string, jobs: NormalizedJob[]): string {
  const mine = jobs.filter(job => job.driverInitials === initials);
  const active = mine.find(job => job.status === "IN_PROGRESS");
  if (active) return `On job · ${active.customerName || active.jobId}`;
  const next = mine.filter(job => job.status === "READY").sort((a, b) => a.bookedStart.localeCompare(b.bookedStart))[0];
  if (next) return `Next · ${formatTime(next.bookedStart)} ${next.customerName || next.jobId}`;
  const done = mine.filter(job => job.status === "COMPLETED").length;
  return done ? `${done} completed today` : "No jobs today";
}

/** The job to show for a driver today: the one in progress, else the next scheduled. */
export function currentJobFor(initials: string, jobs: NormalizedJob[]): NormalizedJob | null {
  const mine = jobs.filter(job => job.driverInitials === initials);
  return mine.find(job => job.status === "IN_PROGRESS") ?? mine.filter(job => job.status === "READY").sort((a, b) => a.bookedStart.localeCompare(b.bookedStart))[0] ?? null;
}

export function DriversPage() {
  const week = dateRangeForPreset("7d");
  const [state, setState] = useUrlState({ view: "drivers", mode: "", q: "", from: week.from!, to: week.to!, driver: "", profile: "" });
  const { view, mode } = driversLocation(state.view, state.mode);
  const roster = useQuery({ queryKey: DRIVER_OPTIONS_QUERY_KEY, queryFn: fetchDriverRoster, staleTime: 5 * 60_000 });
  const today = useTodayJobs();
  const [editing, setEditing] = useState<DriverEditTarget | null | "new">(null);

  const drivers = useMemo(() => (roster.data ?? []).filter(driver => driver.initials && driver.initials !== "UNASSIGNED")
    .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName)), [roster.data]);
  const needle = state.q.trim().toLowerCase();
  const visible = drivers.filter(driver => !needle || [driver.fullName, driver.initials, driver.vanRegistration, driver.email, driver.phone].some(value => (value || "").toLowerCase().includes(needle)));
  const profile = drivers.find(driver => driver.initials === state.profile) ?? null;
  const activeCount = drivers.filter(driver => driver.active).length;

  const columns: Column<AdminDriver>[] = [
    { id: "name", header: "Driver", cell: driver => <CellStack primary={driver.fullName} secondary={driver.initials} /> },
    { id: "contact", header: "Contact", cell: driver => <CellStack primary={driver.email || <Missing>Email not recorded</Missing>} secondary={driver.phone || "Phone not recorded"} /> },
    { id: "account", header: "Account", width: "150px", cell: driver => driver.active ? <Badge tone="success">Account active</Badge> : <Badge tone="neutral">Deactivated</Badge> },
    { id: "vehicle", header: "Assigned vehicle", width: "150px", cell: driver => driver.vanRegistration ? <span className="font-mono text-[13.5px]">{formatVanReg(driver.vanRegistration)}</span> : <Missing>None</Missing> },
    { id: "work", header: "Current / next job", cell: driver => {
      if (today.isError) return <Missing>Unavailable</Missing>;
      if (today.isLoading) return <Missing>Loading…</Missing>;
      const jobs = today.data?.items ?? [], job = currentJobFor(driver.initials, jobs), text = currentWork(driver.initials, jobs);
      return job ? <button type="button" onClick={event => { event.stopPropagation(); openJob(job.jobId); }} aria-label={`Open job ${job.jobId}`} className={cx("text-left text-[13.5px] font-medium text-admin-brand hover:underline", focusRing)}>{text}</button> : <span className="text-[13.5px]">{text}</span>;
    } },
    { id: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "240px",
      cell: driver => <div className="flex justify-end gap-2">
        <Action size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing({ initials: driver.initials, fullName: driver.fullName, email: driver.email, phone: driver.phone, vanRegistration: driver.vanRegistration, active: driver.active })} aria-label={`Edit driver ${driver.fullName}`} title="Edit driver" />
        <Action size="sm" variant="ghost" onClick={() => setState({ profile: driver.initials }, { push: true })} aria-label={`View profile for ${driver.fullName}`}>Profile</Action>
        <Action size="sm" onClick={() => navigateAdmin(driverReportHref(driver.initials, week.from, week.to))} aria-label={`View report for ${driver.fullName}`}>View report</Action>
      </div> }
  ];

  return (
    <>
      <PageHeader title="Drivers" scope={view === "performance" ? "Performance from completed jobs · London time" : `${plural(drivers.length, "driver")} · ${activeCount} with an active account`}
        actions={<Action variant="primary" icon={<Plus />} onClick={() => setEditing("new")}>Add driver</Action>} />
      <Tabs label="Drivers sections" value={view} onChange={next => setState({ view: next }, { push: true })} idBase="drivers"
        tabs={[{ id: "drivers", label: "Drivers" }, { id: "performance", label: "Performance" }]} />

      {view === "drivers" ? (
        <div id="drivers-panel-drivers" role="tabpanel" aria-labelledby="drivers-tab-drivers" className="space-y-4">
          <Toolbar count={mode === "table" && roster.data ? `${visible.length} of ${drivers.length}` : undefined}>
            {mode === "cards" && <DateRangePicker presets="records" from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "" })} />}
            <SearchField label="Search drivers" placeholder="Name, code, vehicle, email or phone" value={state.q} onChange={q => setState({ q })} className="w-full sm:w-[360px]" />
            <div role="group" aria-label="Driver view" className="inline-flex rounded-xl border border-admin-line p-0.5">
              {([["cards", "Cards", <LayoutGrid key="c" aria-hidden className="h-4 w-4" />], ["table", "Table", <List key="t" aria-hidden className="h-4 w-4" />]] as const).map(([id, label, icon]) => (
                <button key={id} type="button" aria-pressed={mode === id} onClick={() => setState({ view: "drivers", mode: id })}
                  className={cx("inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13.5px] font-semibold", focusRing, mode === id ? "bg-admin-brand-soft text-admin-brand" : "text-admin-ink-2 hover:text-admin-ink")}>{icon}{label}</button>
              ))}
            </div>
          </Toolbar>
          {mode === "cards" ? (
            <DriverCards from={state.from || week.from!} to={state.to || week.to!} search={state.q}
              onOpen={initials => navigateAdmin(driverReportHref(initials, state.from || week.from, state.to || week.to))}
              onProfile={initials => setState({ profile: initials }, { push: true })}
              onEdit={driver => setEditing({ initials: driver.initials, fullName: driver.fullName, email: driver.email ?? "", phone: driver.phone, vanRegistration: driver.vanRegistration, imei: driver.imei, active: driver.active })}
              workFor={initials => today.isError ? null : today.isLoading ? "Loading…" : currentWork(initials, today.data?.items ?? [])} />
          ) : (
            <section className={cx(panel, "overflow-hidden")} aria-label="Driver directory">
              {roster.isLoading ? <LoadingState label="Loading drivers" />
                : roster.isError ? <ErrorState title="Couldn't load drivers" message={(roster.error as { message?: string })?.message} onRetry={() => void roster.refetch()} />
                : visible.length === 0 ? (drivers.length ? <EmptyState kind="no-matches" title={`No drivers match “${state.q}”`} actions={<Action onClick={() => setState({ q: "" })}>Clear search</Action>} />
                  : <EmptyState title="No drivers yet" message="Add a driver to give them app access and assign jobs." actions={<Action variant="primary" onClick={() => setEditing("new")}>Add driver</Action>} />)
                : <DataTable rows={visible} columns={columns} keyOf={driver => driver.initials} onOpen={driver => setState({ profile: driver.initials }, { push: true })} openLabel={driver => `View profile for ${driver.fullName}`}
                  caption="Driver directory" minWidth={900} rowTone={driver => driver.active ? "default" : "muted"}
                  mobileRow={driver => (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{driver.fullName} <span className="font-normal text-admin-ink-2">· {driver.initials}</span></span>{driver.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</div>
                      <p className="text-[13px] text-admin-ink-2">{driver.vanRegistration ? formatVanReg(driver.vanRegistration) : "No vehicle"} · {currentWork(driver.initials, today.data?.items ?? [])}</p>
                      <p className="text-[13px] text-admin-ink-2">{[driver.email, driver.phone].filter(Boolean).join(" · ") || "Contact not recorded"}</p>
                    </div>
                  )} />}
            </section>
          )}
        </div>
      ) : (
        <div id="drivers-panel-performance" role="tabpanel" aria-labelledby="drivers-tab-performance">
          <DriverPerformanceSummary from={state.from || undefined} to={state.to || undefined} driver={state.driver}
            onRange={(from, to) => setState({ from: from ?? "", to: to ?? "" })} onDriver={driver => setState({ driver })} />
        </div>
      )}

      {profile && <DriverProfile driver={profile} todayJobs={today.data?.items ?? []} onClose={() => setState({ profile: "" })}
        onEdit={() => setEditing({ initials: profile.initials, fullName: profile.fullName, email: profile.email, phone: profile.phone, vanRegistration: profile.vanRegistration, active: profile.active })} />}
      <AddDriverModal isOpen={editing !== null} onClose={() => setEditing(null)} driverToEdit={editing === "new" ? null : editing} />
    </>
  );
}

function DriverProfile({ driver, todayJobs, onClose, onEdit }: { driver: AdminDriver; todayJobs: NormalizedJob[]; onClose: () => void; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"deactivate" | "reactivate" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const week = dateRangeForPreset("7d");
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: DRIVER_OPTIONS_QUERY_KEY }); void queryClient.invalidateQueries({ queryKey: ["drivers_summary"] }); };

  const run = async () => {
    setBusy(true); setError("");
    try {
      if (confirm === "delete") { await deleteDriver(driver.email); refresh(); onClose(); }
      else { await saveDriver({ initials: driver.initials, fullName: driver.fullName, email: driver.email, phone: driver.phone, vanRegistration: driver.vanRegistration, active: confirm === "reactivate" }); refresh(); setConfirm(null); }
    } catch (err) { setError((err as Error)?.message || "That change could not be saved."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Drawer open onClose={onClose} width="md" title={driver.fullName} subtitle={<span className="flex flex-wrap items-center gap-2">{driver.initials}{driver.active ? <Badge tone="success">Account active</Badge> : <Badge>Account deactivated</Badge>}</span>}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Action variant="primary" onClick={() => navigateAdmin(driverReportHref(driver.initials, week.from, week.to))}>View report</Action>
              <Action icon={<FileText />} onClick={() => setReportOpen(true)}>Generate Report</Action>
            </div>
            <div className="flex gap-2">
              <Action icon={<Pencil />} onClick={onEdit}>Edit</Action>
              <Menu align="end" trigger={props => <Action {...props} aria-label="More driver actions" icon={<MoreHorizontal />}>More</Action>}
                items={[
                  driver.active ? { id: "deactivate", label: "Deactivate account…", icon: <UserX />, onSelect: () => setConfirm("deactivate") } : { id: "reactivate", label: "Reactivate account…", icon: <UserCheck />, onSelect: () => setConfirm("reactivate") },
                  { id: "delete", label: "Delete permanently…", icon: <Trash2 />, tone: "danger", separatorBefore: true, onSelect: () => { setTyped(""); setConfirm("delete"); } }
                ]} />
            </div>
          </div>
        }>
        <div className="space-y-4">
          <section className={cx(panel, "p-4")}>
            <h3 className="mb-3 text-[15px] font-semibold">Contact</h3>
            <Facts rows={[
              { label: "Email (app sign-in)", value: driver.email ? <a className="break-all text-admin-brand hover:underline" href={`mailto:${driver.email}`}>{driver.email}</a> : <Missing /> },
              { label: "Phone", value: driver.phone ? <a className="text-admin-brand hover:underline" href={`tel:${driver.phone}`}>{driver.phone}</a> : <Missing /> }
            ]} />
          </section>
          <section className={cx(panel, "p-4")}>
            <h3 className="mb-3 text-[15px] font-semibold">Account</h3>
            <Facts rows={[
              { label: "App access", value: driver.active ? "Enabled" : "Deactivated", hint: "Whether the driver can sign in. Not an online or availability status." },
              { label: "App password", value: driver.hasPassword ? "Set" : <span className="text-admin-status-amber">Not set</span>, hint: driver.hasPassword ? undefined : "Set one with Edit so the driver can sign in." },
              { label: "Last sign-in", value: driver.lastLoginAt ? formatDateTime(driver.lastLoginAt) : <Missing>Never signed in</Missing> },
              { label: "Role", value: driver.role || "Driver" }
            ]} />
          </section>
          <section className={cx(panel, "p-4")}>
            <h3 className="mb-3 text-[15px] font-semibold">Vehicle and today</h3>
            <Facts rows={[
              { label: "Assigned vehicle", value: driver.vanRegistration ? <span className="font-mono">{formatVanReg(driver.vanRegistration)}</span> : <Missing>None</Missing> },
              { label: "Today", value: currentWork(driver.initials, todayJobs) }
            ]} />
          </section>
        </div>
      </Drawer>

      <GenerateReportModal open={reportOpen} onClose={() => setReportOpen(false)} initial={{ drivers: [driver.initials] }} />
      {confirm && (
        <Modal open onClose={() => !busy && setConfirm(null)} placement="center" dismissible={!busy}
          title={confirm === "delete" ? `Delete ${driver.fullName} permanently?` : confirm === "deactivate" ? `Deactivate ${driver.fullName}?` : `Reactivate ${driver.fullName}?`}
          footer={<div className="flex justify-end gap-2">
            <Action variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Action>
            <Action variant={confirm === "reactivate" ? "primary" : "danger"} loading={busy} disabled={confirm === "delete" && typed.trim().toUpperCase() !== driver.initials} onClick={() => void run()}>
              {confirm === "delete" ? "Delete permanently" : confirm === "deactivate" ? "Deactivate" : "Reactivate"}
            </Action>
          </div>}>
          {confirm === "deactivate" && <p className="text-[14px] text-admin-ink-2">The driver is blocked from signing in to the app. Their jobs and reports are unchanged and you can reactivate them later.</p>}
          {confirm === "reactivate" && <p className="text-[14px] text-admin-ink-2">The driver can sign in to the app again with their existing password.</p>}
          {confirm === "delete" && <>
            <Notice tone="danger" title="This cannot be undone">
              The driver's account is removed. Past jobs still carry the driver code “{driver.initials}”. Deactivate instead if you only need to block sign-in.
            </Notice>
            <label className="mt-3 block text-[13px] font-medium text-admin-ink-2">Type the driver code <strong className="text-admin-ink">{driver.initials}</strong> to confirm
              <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" className={`${controlBase} mt-1 w-full uppercase`} />
            </label>
          </>}
          {error && <p role="alert" className="mt-3 text-[13px] text-admin-status-red">{error}</p>}
        </Modal>
      )}
    </>
  );
}
