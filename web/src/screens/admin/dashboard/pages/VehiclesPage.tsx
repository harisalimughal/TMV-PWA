import { scopedAdminUrl } from "../../../../lib/adminDriverScope";
/**
 * Vehicles: the Van page administrators know from the live dashboard, on the Aurora
 * design system. Same structure as the live VanMileagePage:
 *
 *   toolbar  Today / Yesterday / Tomorrow / 7 days, date range, search, Export CSV,
 *            Refresh, driver count
 *   table    # · Driver · Van · Fuel · Service · Compliance (MOT, tax, service miles)
 *   preview  driver header; Fuel, Service and Vehicle Compliance side by side (road tax
 *            countdown ring, MOT); All van submissions below
 *
 * The date range filters the latest Fuel and Service records shown (as on the live
 * page); compliance is current status and never depends on it. Countdown labels and
 * thresholds come from utils/vehicleStatus.ts, ported from the live page. The
 * "Needs attention" filter and insurance expiry from the earlier Aurora page are kept.
 */
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, Download, ExternalLink, Fuel, Pencil, RefreshCw, ShieldCheck, Trash2, Wrench, X } from "lucide-react";
import { deleteVanRecord, fetchVanDriverRecords, saveVanCompliance } from "../api";
import type { VanComplianceItem, VanDriverRecordItem, VanRecordItem, VanRecordType } from "../types";
import { useUrlState } from "../hooks/useUrlState";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { PhotoModal, type PreviewPhoto } from "../components/PhotoModal";
import { ConfirmDialog } from "../../../../ui/ConfirmDialog";
import { Modal } from "../../../../ui";
import { formatCalendarDate, formatDateTime, formatMoney, formatRange, plural } from "../utils/format";
import { formatVanReg } from "../utils/drivers";
import {
  COMPLIANCE_ALERT_DAYS, SERVICE_MILEAGE_WARNING_MILES, complianceCountdown, complianceSummary, dateStatus, serviceGauge, vehicleAttention, type ComplianceCountdown, type ServiceGauge
} from "../utils/vehicleStatus";
import {
  Action, DataTable, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Pagination, SearchField, Toolbar, controlBase, focusRing, panel, type Column
} from "../components/ds";
import { cx } from "../../../../ui/cx";

type AttentionFilter = "all" | "attention";

const TYPE_META: Record<VanRecordType, { label: string; icon: React.ComponentType<{ className?: string }>; badge: string }> = {
  MILEAGE: { label: "Mileage", icon: Fuel, badge: "border-admin-line bg-admin-surface text-admin-ink-2" },
  FUEL: { label: "Fuel", icon: Fuel, badge: "border-admin-status-amber/25 bg-admin-status-amber-bg text-admin-status-amber" },
  SERVICE: { label: "Service", icon: Wrench, badge: "border-admin-brand/20 bg-admin-brand-soft text-admin-brand" }
};
const COMPLIANCE_BADGE = "border-[rgb(var(--orange-fg)/0.25)] bg-[rgb(var(--orange-subtle))] text-[rgb(var(--orange-fg))]";

/** Fuel: "48,090 mi · £86.40"; Service: "40,610 mi · Interim service · 17 Jul 2026"; Mileage: "48,210 mi". */
export function recordDetail(item: VanRecordItem | null | undefined): string | null {
  if (!item) return null;
  const miles = (value?: number | null) => (value == null ? "" : `${value.toLocaleString("en-GB")} mi`);
  const parts = item.type === "FUEL" ? [miles(item.odometerReading), item.fuelCost == null ? "" : formatMoney(Math.round(item.fuelCost * 100))]
    : item.type === "SERVICE" ? [miles(item.serviceMileage), item.serviceType || "", item.serviceDate ? formatCalendarDate(item.serviceDate) : ""]
    : [miles(item.mileage ?? item.odometerReading)];
  return parts.filter(Boolean).join(" · ") || null;
}

function TypeBadge({ type, label }: { type: VanRecordType; label?: string }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold", meta.badge)}><Icon className="h-3.5 w-3.5" aria-hidden />{label ?? meta.label}</span>;
}

function ComplianceBadge() {
  return <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold", COMPLIANCE_BADGE)}><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Compliance</span>;
}

function Avatar({ initials, size = "md" }: { initials?: string; size?: "md" | "lg" }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full border border-admin-brand/20 bg-admin-brand-soft font-bold text-admin-brand", size === "lg" ? "h-11 w-11 text-[14px]" : "h-9 w-9 text-[12px]")}>
      {initials || "UN"}
    </span>
  );
}

function RecordCell({ item, type }: { item: VanRecordItem | null; type: VanRecordType }) {
  const detail = recordDetail(item);
  return (
    <div className="min-w-[150px] space-y-1">
      <TypeBadge type={type} />
      {item ? (
        <>
          <p className="text-[13.5px] font-semibold text-admin-ink">{detail ?? "Details not recorded"}</p>
          <p className="text-[12.5px] tabular-nums text-admin-ink-2">{formatDateTime(item.submittedAt)}</p>
        </>
      ) : <p className="text-[13px] font-medium text-admin-ink-2">Not uploaded</p>}
    </div>
  );
}

const TONE_TEXT = { ok: "text-admin-ink", warning: "text-admin-status-amber", danger: "text-admin-status-red", empty: "text-admin-ink-2" } as const;

const DUE_WORDS: Record<string, string> = { overdue: "overdue", "due-soon": "due soon", missing: "not recorded" };

/** A text-labelled marker for a vehicle with anything overdue, due soon or unrecorded: red when
 *  something is overdue, amber otherwise. The row tint is only a second cue, never the only one. */
export function attentionSummary(compliance?: VanComplianceItem | null): { text: string; tone: "danger" | "warning" } | null {
  const items = vehicleAttention(compliance);
  if (!items.length) return null;
  return { text: items.map(item => `${item.label} ${DUE_WORDS[item.status.state] ?? item.status.state}`).join(", "), tone: items.some(item => item.status.state === "overdue") ? "danger" : "warning" };
}

function AttentionFlag({ compliance }: { compliance: VanComplianceItem | null }) {
  const flag = attentionSummary(compliance);
  if (!flag) return null;
  return (
    <span title={`Needs attention: ${flag.text}`} className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold",
      flag.tone === "danger" ? "border-admin-status-red/30 bg-admin-status-red-bg text-admin-status-red" : "border-admin-status-amber/30 bg-admin-status-amber-bg text-admin-status-amber")}>
      <AlertTriangle aria-hidden className="h-3 w-3" />Needs attention<span className="sr-only">: {flag.text}</span>
    </span>
  );
}

function ComplianceCell({ compliance }: { compliance: VanComplianceItem | null }) {
  const summary = complianceSummary(compliance);
  const mot = complianceCountdown(compliance?.motExpiryDate);
  const tax = complianceCountdown(compliance?.roadTaxRenewalDate);
  const gauge = serviceGauge(compliance);
  const date = (label: string, raw: string | undefined, countdown: ComplianceCountdown) => (
    <span className={TONE_TEXT[countdown.tone === "ok" ? "ok" : countdown.tone]}>
      {label} {raw ? formatCalendarDate(raw) : "not recorded"}
      {countdown.tone === "danger" && <span className="font-semibold"> · expired</span>}
      {countdown.tone === "warning" && <span className="font-semibold"> · due soon</span>}
    </span>
  );
  return (
    <div className="min-w-[200px] space-y-1">
      <ComplianceBadge />
      <p className={cx("text-[13.5px] font-semibold", TONE_TEXT[summary.tone])}>{summary.label}</p>
      <p className="flex flex-wrap gap-x-2 text-[12.5px] tabular-nums">{date("MOT", compliance?.motExpiryDate, mot)}<span aria-hidden className="text-admin-muted">·</span>{date("Tax", compliance?.roadTaxRenewalDate, tax)}</p>
      {gauge.tone !== "empty" && <p className={cx("text-[12.5px] font-semibold", gauge.tone === "danger" ? "text-admin-status-red" : gauge.tone === "warning" ? "text-admin-status-amber" : "text-admin-ink-2")}>Service: {gauge.status}</p>}
    </div>
  );
}

export function VehiclesPage() {
  const today = dateRangeForPreset("today");
  const [state, setState] = useUrlState({ from: today.from!, to: today.to!, q: "", show: "all", page: "1", vehicle: "" });
  const page = Math.max(1, Number(state.page) || 1);
  const query = useQuery({
    queryKey: ["van-driver-records", page, state.from, state.to, state.q],
    queryFn: () => fetchVanDriverRecords({ page, from: state.from || undefined, to: state.to || undefined, q: state.q }),
    retry: 1
  });
  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;
  const show = (state.show === "attention" ? "attention" : "all") as AttentionFilter;
  const visible = show === "attention" ? items.filter(item => vehicleAttention(item.compliance).length > 0) : items;
  const attentionCount = items.filter(item => vehicleAttention(item.compliance).length > 0).length;
  const selected = items.find(item => item.id === state.vehicle) ?? null;
  const offset = (page - 1) * (pagination?.pageSize || 25);

  const columns: Column<VanDriverRecordItem>[] = [
    { id: "n", header: "#", width: "56px", align: "center", cell: item => <span className="tabular-nums text-admin-ink-2">{offset + items.indexOf(item) + 1}</span> },
    { id: "driver", header: "Driver", cell: item => (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar initials={item.driverInitials} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-admin-ink">{item.driverName || item.driverEmail || "Driver not recorded"}</p>
          {item.driverEmail && <p className="max-w-[240px] truncate text-[12.5px] text-admin-ink-2" title={item.driverEmail}>{item.driverEmail}</p>}
          <div className="mt-1"><AttentionFlag compliance={item.compliance} /></div>
        </div>
      </div>
    ) },
    { id: "van", header: "Van", width: "130px", cell: item => item.vanRegistration
      ? <span className="font-mono text-[14px] font-semibold tracking-wide text-admin-ink">{formatVanReg(item.vanRegistration)}</span>
      : <span className="text-[13px] text-admin-ink-2">No van recorded</span> },
    { id: "fuel", header: "Fuel", cell: item => <RecordCell item={item.latestFuel} type="FUEL" /> },
    { id: "service", header: "Service", width: "250px", cell: item => <RecordCell item={item.latestService} type="SERVICE" /> },
    { id: "compliance", header: "Compliance", cell: item => <ComplianceCell compliance={item.compliance} /> }
  ];

  return (
    <>
      <PageHeader title="Van" scope={<>Fuel and service records in {formatRange(state.from || undefined, state.to || undefined)} · compliance as of today · London time</>} />
      <Toolbar
        count={pagination ? plural(pagination.total, "driver") : undefined}
        activeFilters={[...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => setState({ q: "", page: "1" }) }] : []),
          ...(show === "attention" ? [{ id: "show", label: "Needs attention only", onRemove: () => setState({ show: "all" }) }] : [])]}
        onClearFilters={() => setState({ q: "", show: "all", page: "1" })}
        actions={<>
          <Action icon={<Download />} onClick={() => { window.location.href = scopedAdminUrl("/api/admin/van/records/export.csv"); }}>Export CSV</Action>
          <Action icon={<RefreshCw className={cx(query.isFetching && "animate-spin motion-reduce:animate-none")} />} aria-label="Refresh vehicles" onClick={() => void query.refetch()} />
        </>}>
        <DateRangePicker presets="records" from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => setState({ from: from ?? "", to: to ?? "", page: "1" })} />
        <SearchField label="Search vehicles" placeholder="Search driver, initials, van, fuel or service" value={state.q} debounceMs={300} onChange={q => setState({ q, page: "1" })} className="w-full min-w-[260px] sm:w-[360px]" />
        <button type="button" aria-pressed={show === "attention"} onClick={() => setState({ show: show === "attention" ? "all" : "attention", page: "1" })}
          className={cx("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[13.5px] font-semibold transition", focusRing,
            show === "attention" ? "border-admin-brand/30 bg-admin-brand-soft text-admin-brand" : "border-admin-line bg-surface text-admin-ink-2 hover:text-admin-ink")}>
          <AlertTriangle aria-hidden className="h-4 w-4" />Needs attention<span className="tabular-nums" aria-label={`${attentionCount} on this page`}>{attentionCount}</span>
        </button>
      </Toolbar>

      <section className={cx(panel, "overflow-hidden")} aria-label="Vehicles">
        {query.isLoading ? <LoadingState label="Loading van records" />
          : query.isError ? <ErrorState title="Couldn't load van records" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
          : visible.length === 0 ? (items.length || state.q
            ? <EmptyState kind="no-matches" title={show === "attention" ? "No vehicles need attention on this page" : `No drivers or vans match “${state.q}”`}
                actions={<Action onClick={() => setState({ q: "", show: "all", page: "1" })}>Clear filters</Action>} />
            : <EmptyState title="No van records found" message="Drivers appear here once they submit a mileage, fuel or service record." />)
          : <DataTable rows={visible} columns={columns} keyOf={item => item.id} onOpen={item => setState({ vehicle: item.id }, { push: true })}
              openLabel={item => `Open van details for ${item.driverName || item.driverEmail}${item.vanRegistration ? `, ${formatVanReg(item.vanRegistration)}` : ""}`}
              caption="Drivers and vans" minWidth={1040}
              rowTone={item => vehicleAttention(item.compliance).some(entry => entry.status.state === "overdue") ? "attention" : "default"}
              mobileRow={item => (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar initials={item.driverInitials} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.driverName || item.driverEmail}</p>
                      <p className="truncate text-[12.5px] text-admin-ink-2">{item.driverEmail}</p>
                      <AttentionFlag compliance={item.compliance} />
                    </div>
                    <span className="font-mono text-[13.5px] font-semibold">{item.vanRegistration ? formatVanReg(item.vanRegistration) : "No van"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3"><RecordCell item={item.latestFuel} type="FUEL" /><RecordCell item={item.latestService} type="SERVICE" /></div>
                  <ComplianceCell compliance={item.compliance} />
                </div>
              )} />}
        {pagination && pagination.total > 0 && <Pagination page={page} pageSize={pagination.pageSize} total={pagination.total} noun="driver" onPage={next => setState({ page: String(next) })} />}
      </section>
      <p className="text-[12.5px] text-admin-ink-2">Due soon means within {COMPLIANCE_ALERT_DAYS} days, or within {SERVICE_MILEAGE_WARNING_MILES} miles of the service interval. A recorded date is not proof that a vehicle is compliant.</p>

      {selected && <VanPreview key={selected.id} item={selected} onClose={() => setState({ vehicle: "" })} onChanged={() => void query.refetch()} />}
    </>
  );
}

/* ---------------------------------------------------------------- preview --- */

function Ring({ percent, color, children, label }: { percent: number; color: string; children: React.ReactNode; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative grid h-[132px] w-[132px] place-items-center" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="9" />
        {percent > 0 && <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(percent / 100) * c} ${c}`} />}
      </svg>
      <span className="relative px-3 text-center text-[17px] font-bold leading-tight tabular-nums text-admin-ink">{children}</span>
    </div>
  );
}

function PhotoArea({ record, title, onOpen, onDelete }: { record: VanRecordItem | null; title: string; onOpen: () => void; onDelete?: () => void }) {
  const url = record?.photoUrl || record?.thumbUrl;
  if (!url) {
    return (
      <div className="mt-4 grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-admin-line-strong bg-admin-surface text-center">
        <div className="space-y-1.5 text-admin-ink-2"><Camera className="mx-auto h-5 w-5" aria-hidden /><p className="text-[12.5px] font-medium">No photo uploaded</p></div>
      </div>
    );
  }
  return (
    <div className="group relative mt-4">
      <button type="button" onClick={onOpen} aria-label={`Preview ${title} photo`} className={cx("block w-full overflow-hidden rounded-xl border border-admin-line bg-admin-surface", focusRing)}>
        <img src={record?.thumbUrl || url} alt="" className="aspect-[4/3] w-full object-contain" />
      </button>
      <div className="absolute right-2 top-2 flex gap-1.5">
        <a href={record!.photoUrl || url} target="_blank" rel="noreferrer" aria-label={`Open the original ${title} photo`} className={cx("grid h-8 w-8 place-items-center rounded-lg bg-surface/95 text-admin-ink-2 shadow-sm hover:text-admin-ink", focusRing)}><ExternalLink className="h-4 w-4" aria-hidden /></a>
        {onDelete && <button type="button" onClick={onDelete} aria-label={`Delete ${title} photo`} className={cx("grid h-8 w-8 place-items-center rounded-lg bg-surface/95 text-admin-status-red shadow-sm hover:bg-admin-status-red-bg", focusRing)}><Trash2 className="h-4 w-4" aria-hidden /></button>}
      </div>
    </div>
  );
}

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("flex min-w-0 flex-col overflow-hidden rounded-2xl border border-admin-line bg-surface", className)}>{children}</section>;
}

function EditButton({ editing, onClick, label, onDark = false }: { editing: boolean; onClick: () => void; label: string; onDark?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={editing} aria-label={editing ? `Close ${label} editor` : `Edit ${label}`} title={editing ? "Close editor" : `Edit ${label}`}
      className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition", focusRing, onDark ? "bg-white/15 text-white hover:bg-white/25" : "bg-admin-surface text-admin-ink-2 hover:text-admin-ink")}>
      {editing ? <X className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="text-[12.5px] font-semibold text-admin-ink-2">{label}</span><div className="mt-1">{children}</div>{hint && <span className="mt-1 block text-[12px] text-admin-ink-2">{hint}</span>}</label>;
}

/** Round-trips the whole compliance document, as the live page does, so a save in one card never clears the other card's values. */
function fullPayload(compliance: VanComplianceItem | null, patch: Partial<VanComplianceItem>) {
  return {
    roadTaxRenewalDate: compliance?.roadTaxRenewalDate || "", motExpiryDate: compliance?.motExpiryDate || "", insuranceExpiryDate: compliance?.insuranceExpiryDate || "",
    notes: compliance?.notes || "", serviceIntervalMiles: compliance?.serviceIntervalMiles ?? null, lastServiceMileageOverride: compliance?.lastServiceMileageOverride ?? null, ...patch
  };
}

function VanPreview({ item, onClose, onChanged }: { item: VanDriverRecordItem; onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState(item);
  const [photo, setPhoto] = useState<{ list: PreviewPhoto[]; index: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VanRecordItem | null>(null);
  useEffect(() => setCurrent(item), [item]);

  const asPreview = (record: VanRecordItem): PreviewPhoto => ({ id: record.id, title: `${TYPE_META[record.type].label} photo`, url: record.photoUrl || record.thumbUrl,
    caption: <>{recordDetail(record) ?? "Details not recorded"} · {formatDateTime(record.submittedAt)}</> });
  const openRecord = (record: VanRecordItem | null) => { if (record && (record.photoUrl || record.thumbUrl)) setPhoto({ list: [asPreview(record)], index: 0 }); };
  const saved = (compliance: VanComplianceItem) => { setCurrent(previous => ({ ...previous, compliance })); onChanged(); };
  const removeRecord = async (record: VanRecordItem) => {
    await deleteVanRecord(record.id);
    setCurrent(previous => ({ ...previous, records: previous.records.filter(r => r.id !== record.id),
      latestMileage: previous.latestMileage?.id === record.id ? null : previous.latestMileage,
      latestFuel: previous.latestFuel?.id === record.id ? null : previous.latestFuel,
      latestService: previous.latestService?.id === record.id ? null : previous.latestService }));
    onChanged();
  };

  const header = (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar initials={current.driverInitials} size="lg" />
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-semibold text-admin-ink">{current.driverName || current.driverEmail || "Driver not recorded"}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] font-normal text-admin-ink-2">
          {current.driverEmail && <span className="truncate" title={current.driverEmail}>{current.driverEmail}</span>}
          <span aria-hidden>·</span>
          {current.vanRegistration ? <span className="font-mono font-semibold tracking-wide text-admin-ink">{formatVanReg(current.vanRegistration)}</span> : <span>No van recorded</span>}
        </span>
      </span>
    </span>
  );

  return (
    <>
      <Modal open onClose={onClose} title={header} size="2xl" placement="center">
        <div className="space-y-5 bg-admin-bg/60 -m-4 p-4 sm:-m-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <FuelCard record={current.latestFuel} onOpen={() => openRecord(current.latestFuel)} onDelete={current.latestFuel ? () => setConfirmDelete(current.latestFuel) : undefined} />
            <ServiceCard item={current} onOpen={() => openRecord(current.latestService)} onDelete={current.latestService ? () => setConfirmDelete(current.latestService) : undefined} onSaved={saved} />
            <ComplianceCard item={current} onSaved={saved} />
          </div>
          <Submissions records={current.records} onOpen={record => openRecord(record)} onDelete={record => setConfirmDelete(record)} />
        </div>
      </Modal>
      <PhotoModal isOpen={photo !== null} onClose={() => setPhoto(null)} photos={photo?.list ?? []} index={photo?.index ?? 0} onIndex={index => setPhoto(p => (p ? { ...p, index } : p))} />
      <ConfirmDialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} tone="danger" confirmLabel="Delete record"
        title="Delete this van record?" body="The photo and its details are removed from the van history. This can't be undone."
        onConfirm={async () => { if (confirmDelete) await removeRecord(confirmDelete); setConfirmDelete(null); }} />
    </>
  );
}

function FuelCard({ record, onOpen, onDelete }: { record: VanRecordItem | null; onOpen: () => void; onDelete?: () => void }) {
  return (
    <CardShell>
      <div className="p-4">
        <TypeBadge type="FUEL" />
        <p className="mt-3 text-[18px] font-semibold text-admin-ink">{record ? recordDetail(record) ?? "Details not recorded" : "No fuel record"}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-admin-ink-2">{record ? formatDateTime(record.submittedAt) : "Not uploaded"}</p>
        <PhotoArea record={record} title="Fuel" onOpen={onOpen} onDelete={onDelete} />
      </div>
    </CardShell>
  );
}

function ServiceCard({ item, onOpen, onDelete, onSaved }: { item: VanDriverRecordItem; onOpen: () => void; onDelete?: () => void; onSaved: (c: VanComplianceItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [interval, setInterval] = useState(String(item.compliance?.serviceIntervalMiles ?? ""));
  const [override, setOverride] = useState(String(item.compliance?.lastServiceMileageOverride ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gauge: ServiceGauge = serviceGauge(item.compliance);
  const record = item.latestService;
  useEffect(() => { setInterval(String(item.compliance?.serviceIntervalMiles ?? "")); setOverride(String(item.compliance?.lastServiceMileageOverride ?? "")); }, [item.compliance]);
  const save = async () => {
    const intervalValue = interval.trim() ? Number(interval) : null;
    const overrideValue = override.trim() ? Number(override) : null;
    if (intervalValue !== null && (!Number.isFinite(intervalValue) || intervalValue <= 0)) return setError("Enter a valid service interval.");
    if (overrideValue !== null && (!Number.isFinite(overrideValue) || overrideValue < 0)) return setError("Enter a valid last service mileage.");
    setSaving(true); setError("");
    try { onSaved(await saveVanCompliance(item.vanRegistration, fullPayload(item.compliance, { serviceIntervalMiles: intervalValue, lastServiceMileageOverride: overrideValue }))); setEditing(false); }
    catch (err) { setError((err as Error)?.message || "Couldn't save service settings. Your entries are kept."); }
    finally { setSaving(false); }
  };
  const ringColor = gauge.tone === "danger" ? "rgb(var(--danger-signal))" : gauge.tone === "warning" ? "rgb(var(--warning-signal))" : "rgb(var(--brand))";
  return (
    <CardShell>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2"><TypeBadge type="SERVICE" />{item.vanRegistration && <EditButton editing={editing} onClick={() => setEditing(v => !v)} label="service interval" />}</div>
        <p className="mt-3 text-[18px] font-semibold text-admin-ink">{record ? recordDetail(record) ?? "Details not recorded" : "No service record"}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-admin-ink-2">{record ? formatDateTime(record.submittedAt) : "Not uploaded"}</p>
        <PhotoArea record={record} title="Service" onOpen={onOpen} onDelete={onDelete} />
      </div>
      <div className="flex flex-col items-center gap-3 border-t border-admin-line px-4 py-5 text-center">
        <p className={cx("text-[17px] font-semibold", gauge.tone === "danger" ? "text-admin-status-red" : "text-admin-ink")}>{gauge.top}</p>
        {gauge.center && <Ring percent={gauge.ringPercent} color={ringColor} label={gauge.status}>{gauge.center}</Ring>}
        <p className={cx("text-[13px] font-semibold", gauge.tone === "empty" ? "uppercase tracking-wide text-admin-ink-2" : gauge.tone === "danger" ? "text-admin-status-red" : gauge.tone === "warning" ? "text-admin-status-amber" : "text-admin-brand")}>{gauge.status}</p>
        {gauge.interval !== null && <p className="text-[12.5px] text-admin-ink-2">Service interval: every {gauge.interval.toLocaleString("en-GB")} mi</p>}
      </div>
      {editing && (
        <div className="space-y-3 border-t border-admin-line bg-admin-surface p-4">
          <Field label="Service interval (miles)"><input type="number" min="1" inputMode="numeric" value={interval} onChange={e => setInterval(e.target.value)} placeholder="e.g. 8000" className={cx(controlBase, "w-full")} /></Field>
          <Field label="Override last service mileage" hint="Only needed to correct a bad log entry. Clear it to go back to automatic.">
            <input type="number" min="0" inputMode="numeric" value={override} onChange={e => setOverride(e.target.value)} placeholder="Blank uses the driver's latest Service log" className={cx(controlBase, "w-full")} />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Action variant="primary" className="w-full justify-center" loading={saving} onClick={() => void save()}>Save service settings</Action>
        </div>
      )}
    </CardShell>
  );
}

const COUNTDOWN_TEXT = { ok: "text-admin-status-green", warning: "text-admin-status-amber", danger: "text-admin-status-red", empty: "text-admin-ink-2" } as const;

function ComplianceCard({ item, onSaved }: { item: VanDriverRecordItem; onSaved: (c: VanComplianceItem) => void }) {
  const compliance = item.compliance;
  const [editing, setEditing] = useState(false);
  const [tax, setTax] = useState(compliance?.roadTaxRenewalDate?.slice(0, 10) || "");
  const [mot, setMot] = useState(compliance?.motExpiryDate?.slice(0, 10) || "");
  const [notes, setNotes] = useState(compliance?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setTax(compliance?.roadTaxRenewalDate?.slice(0, 10) || ""); setMot(compliance?.motExpiryDate?.slice(0, 10) || ""); setNotes(compliance?.notes || ""); }, [compliance]);
  const taxCountdown = complianceCountdown(compliance?.roadTaxRenewalDate);
  const motCountdown = complianceCountdown(compliance?.motExpiryDate);
  const insurance = compliance?.insuranceExpiryDate ? dateStatus(compliance.insuranceExpiryDate) : null;
  const save = async () => {
    setSaving(true); setError("");
    try { onSaved(await saveVanCompliance(item.vanRegistration, fullPayload(compliance, { roadTaxRenewalDate: tax, motExpiryDate: mot, notes }))); setEditing(false); }
    catch (err) { setError((err as Error)?.message || "Couldn't save compliance. Your entries are kept."); }
    finally { setSaving(false); }
  };
  const ringColor = taxCountdown.tone === "ok" ? "var(--orange-ring)" : "rgb(var(--danger-signal))";
  return (
    <CardShell className="border-[rgb(var(--orange-fg)/0.3)]">
      <div className="flex items-center justify-between gap-3 bg-[rgb(var(--orange-solid))] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15"><ShieldCheck className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">Vehicle Compliance</h3>
            <p className="truncate font-mono text-[12.5px] font-semibold tracking-wide text-white">{item.vanRegistration ? formatVanReg(item.vanRegistration) : "No van recorded"}</p>
          </div>
        </div>
        {item.vanRegistration && <EditButton editing={editing} onClick={() => setEditing(v => !v)} label="compliance dates" onDark />}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-5 text-center">
        <h4 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-2">Next road tax renewal</h4>
        <p className={cx("text-[22px] font-bold tabular-nums", taxCountdown.tone === "empty" ? "text-admin-ink-2" : "text-admin-ink")}>{compliance?.roadTaxRenewalDate ? formatCalendarDate(compliance.roadTaxRenewalDate) : "Not recorded"}</p>
        <Ring percent={taxCountdown.ringPercent} color={ringColor} label={`Road tax: ${taxCountdown.status}`}>
          <span className={taxCountdown.tone === "danger" ? "text-admin-status-red" : taxCountdown.tone === "empty" ? "text-admin-ink-2" : undefined}>{taxCountdown.center}</span>
        </Ring>
        <p className={cx("text-[13px] font-semibold uppercase tracking-wide", COUNTDOWN_TEXT[taxCountdown.tone])}>{taxCountdown.status}</p>
      </div>

      <div className="mx-4 flex flex-col items-center gap-1.5 border-t border-admin-line py-5 text-center">
        <h4 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-2">Next MOT date</h4>
        <p className={cx("text-[22px] font-bold tabular-nums", motCountdown.tone === "empty" ? "text-admin-ink-2" : "text-admin-ink")}>{compliance?.motExpiryDate ? formatCalendarDate(compliance.motExpiryDate) : "Not recorded"}</p>
        <p className={cx("text-[13px] font-semibold uppercase tracking-wide", COUNTDOWN_TEXT[motCountdown.tone])}>{motCountdown.status}</p>
      </div>

      {(insurance || (compliance?.notes && !editing)) && (
        <div className="space-y-2 border-t border-admin-line px-4 py-3 text-[13px]">
          {insurance && <p className="flex justify-between gap-3"><span className="text-admin-ink-2">Insurance expiry</span><span className="font-semibold">{formatCalendarDate(compliance?.insuranceExpiryDate)} · {insurance.label}</span></p>}
          {compliance?.notes && !editing && <div><p className="text-[12.5px] font-semibold text-admin-ink-2">Notes</p><p className="mt-0.5 whitespace-pre-wrap text-admin-ink">{compliance.notes}</p></div>}
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-t border-admin-line bg-admin-surface p-4">
          <Field label="Road tax renewal"><input type="date" value={tax} onChange={e => setTax(e.target.value)} className={cx(controlBase, "w-full")} /></Field>
          <Field label="MOT expiry"><input type="date" value={mot} onChange={e => setMot(e.target.value)} className={cx(controlBase, "w-full")} /></Field>
          <Field label="Notes"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={cx(controlBase, "h-auto w-full py-2")} /></Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Action variant="primary" className="w-full justify-center" loading={saving} onClick={() => void save()}>Save compliance</Action>
        </div>
      )}
    </CardShell>
  );
}

function Submissions({ records, onOpen, onDelete }: { records: VanRecordItem[]; onOpen: (record: VanRecordItem) => void; onDelete: (record: VanRecordItem) => void }) {
  return (
    <CardShell>
      <div className="flex items-center justify-between border-b border-admin-line px-4 py-3">
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-2">All van submissions</h3>
        <span className="text-[12.5px] tabular-nums text-admin-ink-2">{plural(records.length, "record")}</span>
      </div>
      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-admin-ink-2"><Camera className="h-5 w-5" aria-hidden /><p className="text-[13.5px]">No submissions found.</p></div>
      ) : (
        <ul className="divide-y divide-admin-line">
          {records.map(record => {
            const thumb = record.thumbUrl || record.photoUrl;
            return (
              <li key={record.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => onOpen(record)} disabled={!thumb} aria-label={thumb ? `Preview ${TYPE_META[record.type].label} photo from ${formatDateTime(record.submittedAt)}` : "No photo"}
                  className={cx("grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-admin-line bg-admin-surface text-admin-ink-2", focusRing)}>
                  {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Camera className="h-4 w-4" aria-hidden />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><TypeBadge type={record.type} /><span className="text-[13.5px] font-semibold text-admin-ink">{recordDetail(record) ?? "Details not recorded"}</span></div>
                  <p className="mt-1 text-[12.5px] tabular-nums text-admin-ink-2">{formatDateTime(record.submittedAt)}</p>
                </div>
                {record.photoUrl && <a href={record.photoUrl} target="_blank" rel="noreferrer" aria-label="Open the original photo" className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}><ExternalLink className="h-4 w-4" aria-hidden /></a>}
                <button type="button" onClick={() => onDelete(record)} aria-label={`Delete ${TYPE_META[record.type].label} record from ${formatDateTime(record.submittedAt)}`}
                  className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-status-red-bg hover:text-admin-status-red", focusRing)}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
