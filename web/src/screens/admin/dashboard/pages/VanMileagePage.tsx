import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Fuel, Pencil, RefreshCw, Search, ShieldCheck, Truck, Wrench, X } from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker";
import { ApiErrorState } from "../components/ApiErrorState";
import { fetchVanDriverRecords, saveVanCompliance } from "../api";
import { VanComplianceItem, VanDriverRecordItem, VanRecordItem, VanRecordType } from "../types";
import { formatLondonDate, formatLondonDateTime } from "../utils/date";

const TYPE_META: Record<VanRecordType, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  MILEAGE: { label: "Mileage", icon: Fuel, className: "bg-admin-surface border-admin-line text-admin-ink" },
  FUEL: { label: "Fuel", icon: Fuel, className: "bg-admin-status-amber-bg border-admin-status-amber/20 text-admin-status-amber" },
  SERVICE: { label: "Service", icon: Wrench, className: "bg-[#EFF6FF] border-[#2563EB]/20 text-[#2563EB]" }
};
const COMPLIANCE_ALERT_DAYS = 30;
const COMPLIANCE_RING_ORANGE = "#ff8a00";
const COMPLIANCE_RING_TRACK = "#d6d6d6";
const DAY_MS = 24 * 60 * 60 * 1000;

function recordDetail(item: VanRecordItem | null, type: VanRecordType): string {
  if (!item) return "-";
  switch (type) {
    case "FUEL":
      return [
        item.odometerReading == null ? "" : `${item.odometerReading.toLocaleString()} mi`,
        item.fuelCost == null ? "" : `£${item.fuelCost.toFixed(2)}`
      ].filter(Boolean).join(" · ") || "-";
    case "SERVICE":
      return [
        item.serviceMileage == null ? "" : `${item.serviceMileage.toLocaleString()} mi`,
        item.serviceType,
        item.serviceDate ? formatLondonDate(item.serviceDate) : ""
      ].filter(Boolean).join(" · ") || "-";
    case "MILEAGE":
    default:
      return item.mileage == null ? "-" : item.mileage.toLocaleString();
  }
}

function RecordCell({ item, type }: { item: VanRecordItem | null; type: VanRecordType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div className="min-w-[150px]">
      <div className={`inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
        <Icon className="w-3.5 h-3.5" /> {meta.label}
      </div>
      <div className="mt-2 text-[13px] font-semibold text-admin-ink">{recordDetail(item, type)}</div>
      <div className="mt-0.5 text-[11px] text-admin-muted">{item ? formatLondonDateTime(item.submittedAt) : "Not uploaded"}</div>
    </div>
  );
}

function ComplianceCell({ compliance }: { compliance: VanComplianceItem | null }) {
  const hasAny = Boolean(compliance?.roadTaxRenewalDate || compliance?.motExpiryDate || compliance?.insuranceExpiryDate);
  return (
    <div className="min-w-[150px]">
      <div className="inline-flex items-center gap-1.5 rounded-control border border-admin-status-amber/20 bg-admin-status-amber-bg px-2 py-1 text-[11px] font-semibold text-admin-status-amber">
        <ShieldCheck className="w-3.5 h-3.5" /> Compliance
      </div>
      <div className="mt-2 text-[13px] font-semibold text-admin-ink">{hasAny ? "Recorded" : "Not recorded"}</div>
      <div className="mt-0.5 text-[11px] text-admin-muted">
        MOT {compliance?.motExpiryDate || "-"} · Tax {compliance?.roadTaxRenewalDate || "-"}
      </div>
    </div>
  );
}

export function VanMileagePage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VanDriverRecordItem | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["van-driver-records", page, from, to, search],
    queryFn: () => fetchVanDriverRecords({ page, from, to, q: search }),
    retry: 1
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-card bg-admin-brand text-white flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5" />
          </div>
          <h1 className="text-title text-fg truncate">Van</h1>
        </div>
        <button
          onClick={() => { window.location.href = "/api/admin/van/records/export.csv"; }}
          className="h-9 px-3 rounded-card border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface transition flex items-center gap-2"
        >
          <Download className="w-4 h-4 text-admin-muted" /> Export CSV
        </button>
      </div>

      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search driver, initials, van, fuel or service..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-9 pl-9 pr-3 rounded-full border border-admin-line bg-admin-surface text-[13px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand focus:bg-white transition"
          />
        </div>
        <div className="w-[1px] h-6 bg-admin-line hidden sm:block" />
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
        <span className="text-[13px] text-admin-muted font-medium ml-auto">
          {isLoading ? "..." : `${pagination?.total ?? 0} driver${(pagination?.total ?? 0) === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={() => refetch()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-admin-brand" : ""}`} />
        </button>
      </div>

      {isError && <ApiErrorState message={(error as Error)?.message} onRetry={() => void refetch()} />}

      {!isError && (
        <div className="bg-white rounded-module shadow-sm border border-admin-line overflow-hidden">
          <div className="overflow-x-auto min-h-[420px]">
            <table className="w-full text-left text-[14px] border-collapse">
              <thead className="bg-white border-b border-admin-line">
                <tr>
                  <th className="py-4 px-2 w-12 text-center font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">#</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Driver</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Van</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Fuel</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Service</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-[0.03em]">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {isLoading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-admin-muted">Loading van records...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-admin-muted">No van records found.</td></tr>
                ) : items.map((item, index) => (
                  <tr key={item.id} onClick={() => setSelected(item)} className="h-[84px] group cursor-pointer hover:bg-[#F9FAFB] transition">
                    <td className="px-2 text-center text-[13px] text-admin-muted tabular-nums">{(page - 1) * 25 + index + 1}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-admin-brand-soft text-admin-brand border border-admin-brand/20 flex items-center justify-center font-bold text-[11px]">
                          {item.driverInitials || "UN"}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-admin-ink">{item.driverName || item.driverEmail}</div>
                          <div className="text-[11px] text-admin-muted">{item.driverEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 font-mono text-[13px] text-admin-ink">{item.vanRegistration || "-"}</td>
                    <td className="px-4"><RecordCell item={item.latestFuel} type="FUEL" /></td>
                    <td className="px-4"><RecordCell item={item.latestService} type="SERVICE" /></td>
                    <td className="px-4">
                      <ComplianceCell compliance={item.compliance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-admin-line bg-white flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-admin-muted">
                Showing {(page - 1) * pagination.pageSize + 1}-{Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total} drivers
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition">Prev</button>
                <div className="text-label font-medium text-fg-muted mx-2">{page} / {pagination.totalPages || 1}</div>
                <button disabled={page >= (pagination.totalPages || 1)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 transition">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <VanDriverModal
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={updated => {
            setSelected(current => current ? { ...current, compliance: updated } : current);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function VanDriverModal({ item, onClose, onSaved }: { item: VanDriverRecordItem; onClose: () => void; onSaved: (compliance: VanComplianceItem) => void }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-admin-ink/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-module border border-white/10 bg-[#F5F5F5] shadow-2xl animate-in zoom-in-95 fade-in duration-200 flex flex-col">
        <div className="px-6 py-5 bg-white border-b border-admin-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-admin-brand-soft text-admin-brand border border-admin-brand/20 flex items-center justify-center font-bold text-[13px]">
              {item.driverInitials || "UN"}
            </div>
            <div className="min-w-0">
              <h2 className="text-card text-fg truncate">{item.driverName || item.driverEmail}</h2>
              <p className="text-[12px] text-admin-muted">{item.driverEmail} · {item.vanRegistration || "No van recorded"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RecordPreview title="Fuel" item={item.latestFuel} type="FUEL" />
            <RecordPreview title="Service" item={item.latestService} type="SERVICE" />
            <CompliancePreview item={item} onSaved={onSaved} />
          </div>

          <div className="bg-white rounded-module border border-admin-line overflow-hidden">
            <div className="px-4 py-3 border-b border-admin-line text-[12px] font-bold text-admin-muted uppercase tracking-wider">All van submissions</div>
            <div className="divide-y divide-admin-line">
              {item.records.map(record => (
                <a key={record.id} href={record.photoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 px-4 py-3 hover:bg-admin-surface transition">
                  <img src={record.thumbUrl || record.photoUrl} alt={TYPE_META[record.type].label} className="w-14 h-14 rounded-card object-cover border border-admin-line bg-admin-surface" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-admin-ink">{TYPE_META[record.type].label} · {recordDetail(record, record.type)}</div>
                    <div className="text-[12px] text-admin-muted">{formatLondonDateTime(record.submittedAt)}</div>
                  </div>
                </a>
              ))}
              {item.records.length === 0 && <div className="px-4 py-8 text-center text-admin-muted">No submissions found.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordPreview({ title, item, type }: { title: string; item: VanRecordItem | null; type: VanRecordType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div className="bg-white rounded-module border border-admin-line p-4">
      <div className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-[12px] font-semibold ${meta.className}`}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      <div className="mt-3 text-[18px] font-bold text-admin-ink">{recordDetail(item, type)}</div>
      <div className="mt-1 text-[12px] text-admin-muted">{item ? formatLondonDateTime(item.submittedAt) : "Not uploaded"}</div>
      {item?.photoUrl ? (
        <a href={item.photoUrl} target="_blank" rel="noreferrer" className="mt-4 block">
          <img src={item.photoUrl} alt={title} className="w-full aspect-[4/3] object-contain rounded-card bg-admin-surface border border-admin-line" />
        </a>
      ) : (
        <div className="mt-4 aspect-[4/3] rounded-card bg-admin-surface border border-dashed border-admin-line flex items-center justify-center text-admin-muted">
          <Camera className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

function CompliancePreview({ item, onSaved }: { item: VanDriverRecordItem; onSaved: (compliance: VanComplianceItem) => void }) {
  const [roadTaxRenewalDate, setRoadTaxRenewalDate] = useState(item.compliance?.roadTaxRenewalDate || "");
  const [motExpiryDate, setMotExpiryDate] = useState(item.compliance?.motExpiryDate || "");
  const [notes, setNotes] = useState(item.compliance?.notes || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const complianceItems = buildComplianceItems({
    roadTaxRenewalDate: item.compliance?.roadTaxRenewalDate || roadTaxRenewalDate,
    motExpiryDate: item.compliance?.motExpiryDate || motExpiryDate
  });

  useEffect(() => {
    setRoadTaxRenewalDate(item.compliance?.roadTaxRenewalDate || "");
    setMotExpiryDate(item.compliance?.motExpiryDate || "");
    setNotes(item.compliance?.notes || "");
    setError("");
  }, [item.compliance]);

  async function handleSave() {
    if (!item.vanRegistration || saving) return;
    setSaving(true);
    setError("");
    try {
      const compliance = await saveVanCompliance(item.vanRegistration, {
        roadTaxRenewalDate,
        motExpiryDate,
        insuranceExpiryDate: item.compliance?.insuranceExpiryDate || "",
        notes
      });
      onSaved(compliance);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save compliance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-module border border-admin-line bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: COMPLIANCE_RING_ORANGE }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-card bg-white/25">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-bold">Vehicle Compliance</h3>
            <p className="truncate text-[11px] font-semibold opacity-85">{item.vanRegistration || "No van recorded"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(value => !value)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
          title={editing ? "Close editor" : "Edit compliance dates"}
          aria-label={editing ? "Close compliance editor" : "Edit compliance dates"}
        >
          {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
      </div>

      <div className="divide-y divide-admin-line px-4">
        {complianceItems.map(complianceItem => (
          <ComplianceStatus key={complianceItem.key} item={complianceItem} />
        ))}
      </div>

      {item.compliance?.notes && !editing && (
        <div className="border-t border-admin-line px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-admin-muted">Notes</p>
          <p className="mt-1 text-[13px] font-medium text-admin-ink">{item.compliance.notes}</p>
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-t border-admin-line bg-admin-surface px-4 py-4">
          <ComplianceInput label="Road tax renewal" value={roadTaxRenewalDate} onChange={setRoadTaxRenewalDate} />
          <ComplianceInput label="MOT expiry" value={motExpiryDate} onChange={setMotExpiryDate} />
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-admin-muted">Notes</span>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-card border border-admin-line bg-white px-3 py-2 text-[13px] font-medium text-admin-ink outline-none focus:border-admin-brand"
              placeholder="Optional"
            />
          </label>
          {error && <div className="text-[12px] font-semibold text-admin-status-red">{error}</div>}
          <button
            type="button"
            disabled={!item.vanRegistration || saving}
            onClick={() => void handleSave()}
            className="h-9 w-full rounded-card bg-admin-brand px-3 text-[13px] font-bold text-white transition hover:bg-admin-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save compliance"}
          </button>
        </div>
      )}
    </div>
  );
}

type ComplianceStatusItem = {
  key: "roadTaxRenewalDate" | "motExpiryDate";
  label: string;
  rawDate?: string;
  formattedDate: string;
  daysRemaining: number | null;
  centerLabel: string;
  statusLabel: string;
  tone: "ok" | "warning" | "danger" | "empty";
  ringPercent: number;
};

function buildComplianceItems(compliance: Pick<VanComplianceItem, "roadTaxRenewalDate" | "motExpiryDate">): ComplianceStatusItem[] {
  return [
    buildComplianceItem("roadTaxRenewalDate", "Next road tax renewal", compliance.roadTaxRenewalDate),
    buildComplianceItem("motExpiryDate", "Next MOT date", compliance.motExpiryDate)
  ];
}

function buildComplianceItem(key: ComplianceStatusItem["key"], label: string, rawDate?: string): ComplianceStatusItem {
  const daysRemaining = daysUntil(rawDate);
  const hasDate = daysRemaining !== null;
  const expired = hasDate && daysRemaining < 0;
  const dueSoon = hasDate && daysRemaining >= 0 && daysRemaining <= COMPLIANCE_ALERT_DAYS;
  const tone = !hasDate ? "empty" : expired ? "danger" : dueSoon ? "warning" : "ok";
  const ringPercent = !hasDate
    ? 0
    : expired
      ? 100
      : dueSoon
        ? Math.max(8, Math.round(((COMPLIANCE_ALERT_DAYS - daysRemaining) / COMPLIANCE_ALERT_DAYS) * 100))
        : 0;

  return {
    key,
    label,
    rawDate,
    formattedDate: rawDate ? formatComplianceDate(rawDate) : "Not recorded",
    daysRemaining,
    centerLabel: centerLabel(daysRemaining),
    statusLabel: statusLabel(daysRemaining),
    tone,
    ringPercent
  };
}

function ComplianceStatus({ item }: { item: ComplianceStatusItem }) {
  const showRing = item.tone === "warning" || item.tone === "danger";
  return (
    <div className="flex flex-col items-center gap-3 py-5 text-center">
      <div>
        <h4 className="text-[14px] font-bold uppercase text-admin-ink">{item.label}</h4>
        <p className={`mt-1 text-[22px] font-extrabold ${item.tone === "ok" ? "text-admin-status-green" : "text-admin-ink"}`}>
          {item.formattedDate}
        </p>
      </div>

      {showRing && (
        <div
          className="grid h-[132px] w-[132px] place-items-center rounded-full"
          style={{
            background: `conic-gradient(${COMPLIANCE_RING_ORANGE} ${item.ringPercent}%, ${COMPLIANCE_RING_TRACK} 0)`
          }}
        >
          <div className="grid h-[110px] w-[110px] place-items-center rounded-full bg-white">
            <span className={`px-2 text-[16px] font-extrabold ${item.tone === "danger" ? "text-admin-status-red" : "text-admin-ink"}`}>
              {item.centerLabel}
            </span>
          </div>
        </div>
      )}

      <p className={`text-[13px] font-extrabold uppercase ${
        item.tone === "danger"
          ? "text-admin-status-red"
          : item.tone === "warning"
            ? "text-admin-status-amber"
            : item.tone === "ok"
              ? "text-admin-status-green"
              : "text-admin-muted"
      }`}>
        {item.statusLabel}
      </p>
    </div>
  );
}

function daysUntil(rawDate?: string): number | null {
  if (!rawDate) return null;
  const dateOnly = rawDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / DAY_MS);
}

function formatComplianceDate(rawDate: string): string {
  const dateOnly = rawDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return rawDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(date)
    .toUpperCase();
}

function centerLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return "Missing";
  if (daysRemaining < 0) return "Expired";
  if (daysRemaining === 0) return "Today";
  return `${daysRemaining} days`;
}

function statusLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return "Add date";
  if (daysRemaining < 0) return `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} ago`;
  if (daysRemaining === 0) return "Due today";
  if (daysRemaining <= COMPLIANCE_ALERT_DAYS) return `Alert: Due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  return "Status: OK";
}

function ComplianceInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-admin-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-card border border-admin-line bg-admin-surface px-3 text-[13px] font-semibold text-admin-ink outline-none focus:border-admin-brand focus:bg-white"
      />
    </label>
  );
}
