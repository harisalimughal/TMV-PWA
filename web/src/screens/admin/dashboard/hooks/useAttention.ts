/**
 * "Needs attention" -- one source of truth for the Overview list, the Alerts page and
 * the header bell (audit p.19: the bell must open the same alert source rather than
 * imply a separate inbox).
 *
 * Only categories with a clear definition and real data behind them are produced
 * (audit p.7, prompt §7). Each is derived from an existing server field; nothing here
 * invents a threshold except the shared tracker-freshness policy (utils/freshness.ts).
 *
 * Each source loads independently. A failed source is reported, never treated as
 * "nothing to report" -- callers show which sources are missing.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { fetchAlerts, fetchJobs, fetchLiveFleet, fetchNotifications, type AlertRow, type LiveFleetVehicle, type NotificationRow } from "../api";
import type { NormalizedJob } from "../types";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { formatMoney } from "../utils/format";
import { parseTrackerTime, signalFreshness } from "../utils/freshness";

export type AttentionSeverity = "high" | "medium" | "low";
export type AttentionCategory = "unassigned" | "tracker" | "proof" | "evidence" | "invoice" | "charge" | "delivery" | "fleet";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  category: AttentionCategory;
  /** Short reason, e.g. "No driver assigned". */
  title: string;
  /** Supporting fact: who/what/when. */
  detail: string;
  at: string | null;
  jobId?: string;
  driver?: string;
  vehicle?: string;
  /** Next action label + where it goes. */
  action: { label: string; kind: "job" | "fleet" | "delivery" | "fleet-events"; target?: string };
  /** Number of grouped occurrences (repeated fleet events). */
  occurrences?: number;
}

export interface AttentionSource { id: "jobs" | "fleet" | "delivery" | "events"; label: string; status: "loading" | "ok" | "error"; error?: string; updatedAt?: number }

export const CATEGORY_LABEL: Record<AttentionCategory, string> = {
  unassigned: "No driver assigned", tracker: "Tracker signal stale", proof: "Arrival proof overdue", evidence: "Evidence incomplete",
  invoice: "Invoice to collect", charge: "Final charge to check", delivery: "Message not delivered", fleet: "Fleet safety event"
};

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

export function isUnassigned(job: Pick<NormalizedJob, "driverInitials" | "driverName">): boolean {
  const code = (job.driverInitials || "").trim().toUpperCase();
  return !code || code === "UNASSIGNED" || code === "UN" || !job.driverName || job.driverName === "Unassigned";
}

const EVIDENCE_LABELS: Array<[keyof NormalizedJob["evidenceCompleteness"], string]> = [["arrival", "arrival photo"], ["vanLoaded", "van loaded photo"], ["emptyVan", "empty van photo"], ["signature", "customer signature"]];

/** Required evidence still missing/failed on a job. Stop-by/organised photos are only
 *  taken when relevant, so they are never counted as missing. */
export function missingEvidence(job: Pick<NormalizedJob, "evidenceCompleteness">): string[] {
  const completeness = job.evidenceCompleteness;
  if (!completeness) return [];
  return EVIDENCE_LABELS.filter(([key]) => completeness[key] === "MISSING" || completeness[key] === "FAILED").map(([, label]) => label);
}

const invoiceRow = (job: Pick<NormalizedJob, "paymentBreakdown">) => job.paymentBreakdown?.find(entry => (entry.method || "").toLowerCase().startsWith("invoice"));

/** Whether the job was recorded as invoiced at completion -- billed, not a receipt --
 *  even when the invoice amount itself wasn't recorded (stored as 0). */
export function hasInvoice(job: Pick<NormalizedJob, "paymentBreakdown">): boolean { return !!invoiceRow(job); }

/** Invoiced amount, or null when there is no invoice or its amount wasn't recorded. */
export function invoiceAmountPence(job: Pick<NormalizedJob, "paymentBreakdown">): number | null {
  const row = invoiceRow(job);
  return row && row.amount > 0 ? row.amount : null;
}

/**
 * A completed job whose final charge is implausibly far above its own priced parts
 * (base, extras, overtime, road charges): more than ten times as much and at least
 * £1,000 more. This is how one mistyped final charge (e.g. 898988888 on a £211.60 job)
 * inflated a driver's "revenue handled" to £898m. The stored value is shown as it is;
 * the flag only asks someone to check it. Null when the parts are unknown.
 */
export function finalChargeOutlier(job: NormalizedJob): { finalPence: number; expectedPence: number } | null {
  if (job.status !== "COMPLETED" || typeof job.amountCharged !== "number") return null;
  const parts = [job.basePrice, job.extraCharges, job.overtimeCharge, job.congestionCharge, job.tunnelCharge].map(value => typeof value === "number" && Number.isFinite(value) ? value : 0);
  const expected = parts.reduce((sum, value) => sum + value, 0);
  if (expected <= 0) return null;
  return job.amountCharged > expected * 10 && job.amountCharged - expected >= 100_000 ? { finalPence: job.amountCharged, expectedPence: expected } : null;
}

export function jobAttention(job: NormalizedJob): AttentionItem[] {
  const items: AttentionItem[] = [];
  const who = job.customerName || "Customer not recorded";
  const base = { jobId: job.jobId, driver: job.driverName || undefined, at: job.bookedStart || null };
  const open = { label: "Open job", kind: "job" as const, target: job.jobId };
  const active = job.status === "READY" || job.status === "IN_PROGRESS";
  if (active && isUnassigned(job)) items.push({ ...base, id: `unassigned:${job.jobId}`, severity: "high", category: "unassigned", title: "No driver assigned", detail: `${who} · ${job.jobId}`, action: open });
  if (job.status === "IN_PROGRESS" && job.trackerStatus === "stale") items.push({ ...base, id: `tracker:${job.jobId}`, severity: "medium", category: "tracker", title: "Tracker signal stale during job", detail: `${who} · ${job.driverName || "No driver"}`, action: open });
  if (job.status === "IN_PROGRESS" && job.arrivalProofOverdue) items.push({ ...base, id: `proof:${job.jobId}`, severity: "medium", category: "proof", title: "Arrival proof photo overdue", detail: `${who} · ${job.arrivalProofDelayMinutes ?? "?"} min since tracker arrival`, action: open });
  if (job.status === "COMPLETED") {
    const missing = missingEvidence(job);
    if (missing.length) items.push({ ...base, at: job.actualFinish || base.at, id: `evidence:${job.jobId}`, severity: "low", category: "evidence", title: "Completed with evidence missing", detail: `${who} · ${missing.join(", ")}`, action: { label: "Review evidence", kind: "job", target: job.jobId } });
    const outlier = finalChargeOutlier(job);
    if (outlier) items.push({ ...base, at: job.actualFinish || base.at, id: `charge:${job.jobId}`, severity: "medium", category: "charge", title: `Final charge to check · ${formatMoney(outlier.finalPence)}`, detail: `${who} · priced parts add up to ${formatMoney(outlier.expectedPence)}; the final charge may be mistyped`, action: { label: "Open charges", kind: "job", target: job.jobId } });
    const invoice = invoiceAmountPence(job);
    if (hasInvoice(job)) items.push({ ...base, at: job.actualFinish || base.at, id: `invoice:${job.jobId}`, severity: "low", category: "invoice", title: `Invoice to collect · ${invoice !== null ? formatMoney(invoice) : "amount not recorded"}`, detail: `${who} · recorded as invoice at completion; later payment is not tracked here`, action: { label: "Open charges", kind: "job", target: job.jobId } });
  }
  return items;
}

export function fleetAttention(vehicles: LiveFleetVehicle[], jobs: NormalizedJob[], now = DateTime.utc()): AttentionItem[] {
  const active = new Map(jobs.filter(job => job.status === "IN_PROGRESS" && job.driverInitials).map(job => [job.driverInitials, job]));
  return vehicles.flatMap(vehicle => {
    const job = vehicle.driverInitials ? active.get(vehicle.driverInitials) : undefined;
    if (!job || signalFreshness(vehicle.lastUpdate, now) !== "stale") return [];
    const at = parseTrackerTime(vehicle.lastUpdate);
    return [{
      id: `tracker:${job.jobId}`, severity: "medium" as const, category: "tracker" as const, title: "Tracker signal stale during job",
      detail: `${vehicle.plateNumber || vehicle.name} · ${vehicle.driverName || vehicle.driverInitials} · ${job.customerName || job.jobId}`,
      at: at?.toISO() ?? null, jobId: job.jobId, driver: vehicle.driverName || undefined, vehicle: vehicle.plateNumber || vehicle.name,
      action: { label: "View on map", kind: "fleet" as const, target: vehicle.imei }
    }];
  });
}

export function deliveryAttention(rows: NotificationRow[]): AttentionItem[] {
  return rows.flatMap(row => {
    const failed = ([["email", "Email"], ["sms", "SMS"]] as const).filter(([key]) => row[key]?.state === "failed");
    if (!failed.length) return [];
    const channels = failed.map(([, label]) => label).join(" and ");
    const latest = failed.map(([key]) => row[key].at).filter(Boolean).sort().pop() || null;
    return [{
      id: `delivery:${row.jobId}`, severity: "medium" as const, category: "delivery" as const, title: `Customer ${channels} failed`,
      detail: `${row.customerName || "Customer"} · ${row.jobId}${failed[0][1] ? ` · ${row[failed[0][0]].detail || "no provider detail"}` : ""}`,
      at: latest, jobId: row.jobId, action: { label: "View delivery log", kind: "delivery" as const, target: row.jobId }
    }];
  });
}

const SAFETY_TYPES: Record<string, { title: string; severity: AttentionSeverity }> = {
  sos: { title: "SOS pressed", severity: "high" }, panic: { title: "SOS pressed", severity: "high" },
  overspeed: { title: "Overspeed", severity: "medium" }, speed: { title: "Overspeed", severity: "medium" }
};

/** Safety events only, grouped per vehicle and type (audit: "A repeated GPS issue
 *  should be grouped rather than flooding the list"). Zone entries are road-charge
 *  evidence, not alerts, and stay in the Fleet events log. */
export function eventAttention(rows: AlertRow[]): AttentionItem[] {
  const groups = new Map<string, { rows: AlertRow[]; meta: { title: string; severity: AttentionSeverity } }>();
  for (const row of rows) {
    const meta = SAFETY_TYPES[(row.type || "").toLowerCase()];
    if (!meta) continue;
    const key = `${row.deviceName || "unknown"}:${meta.title}`;
    const group = groups.get(key) ?? { rows: [], meta };
    group.rows.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.entries()).map(([key, group]) => {
    const latest = group.rows.map(row => parseTrackerTime(row.detectedAt)?.toISO() ?? null).filter((value): value is string => !!value).sort().pop() ?? null;
    const first = group.rows[0];
    return {
      id: `event:${key}`, severity: group.meta.severity, category: "fleet" as const, title: group.meta.title,
      detail: `${first.deviceName || "Unknown vehicle"} · ${first.driverName || "No driver linked"}`,
      at: latest, driver: first.driverName || undefined, vehicle: first.deviceName || undefined, occurrences: group.rows.length,
      action: { label: "View fleet events", kind: "fleet-events" as const }
    };
  });
}

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  const unique = new Map<string, AttentionItem>();
  for (const item of items) if (!unique.has(item.id)) unique.set(item.id, item);
  return Array.from(unique.values()).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.at || "").localeCompare(a.at || ""));
}

export const TODAY_JOBS_PAGE_SIZE = 100;

/** Today's jobs (London day), shared by Overview and the attention list. */
export function useTodayJobs(includeMA = true) {
  const range = dateRangeForPreset("today");
  return useQuery({
    queryKey: ["today_jobs", range.from, includeMA],
    queryFn: () => fetchJobs({ from: range.from, to: range.to, page: 1, pageSize: TODAY_JOBS_PAGE_SIZE, sort: "bookedStart", dir: "asc", ...(!includeMA ? { includeMA: "0" } : {}) }),
    refetchInterval: 60_000,
    staleTime: 30_000
  });
}

export function useAttention({ includeEvents = true, includeMA = true }: { includeEvents?: boolean; includeMA?: boolean } = {}) {
  const jobs = useTodayJobs(includeMA);
  const fleet = useQuery({ queryKey: ["fleet_live"], queryFn: fetchLiveFleet, refetchInterval: 30_000, staleTime: 10_000 });
  const delivery = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(), refetchInterval: 120_000, staleTime: 60_000 });
  const events = useQuery({ queryKey: ["gpslive_alerts", undefined, undefined], queryFn: () => fetchAlerts(), refetchInterval: 60_000, staleTime: 30_000, enabled: includeEvents });

  const visible = (row: { driverInitials?: string | null }) => includeMA || row.driverInitials?.trim().toUpperCase() !== "MA";
  const todayJobs = (jobs.data?.items ?? []).filter(visible);
  const fleetVehicles = (fleet.data?.vehicles ?? []).filter(visible);
  const items = useMemo(() => sortAttention([
    ...todayJobs.flatMap(jobAttention),
    ...fleetAttention(fleetVehicles, todayJobs),
    ...deliveryAttention((delivery.data?.rows ?? []).filter(visible)),
    ...(includeEvents ? eventAttention((events.data?.rows ?? []).filter(visible)) : [])
  ]), [todayJobs, fleet.data, delivery.data, events.data, includeEvents, includeMA]);

  const status = (query: { isLoading: boolean; isError: boolean; error: unknown; dataUpdatedAt: number }) =>
    query.isError ? "error" as const : query.isLoading ? "loading" as const : "ok" as const;
  const sources: AttentionSource[] = [
    { id: "jobs", label: "Today's jobs", status: status(jobs), error: (jobs.error as Error | null)?.message, updatedAt: jobs.dataUpdatedAt },
    { id: "fleet", label: "Live tracker positions", status: status(fleet), error: (fleet.error as Error | null)?.message, updatedAt: fleet.dataUpdatedAt },
    { id: "delivery", label: "Message delivery log", status: status(delivery), error: (delivery.error as Error | null)?.message, updatedAt: delivery.dataUpdatedAt },
    ...(includeEvents ? [{ id: "events" as const, label: "GPSLive fleet events", status: status(events), error: (events.error as Error | null)?.message, updatedAt: events.dataUpdatedAt }] : [])
  ];
  const jobsTruncated = !!jobs.data && jobs.data.pagination.total > jobs.data.items.length;
  return {
    items, sources, todayJobs, jobsQuery: jobs, jobsTruncated, fleetQuery: fleet, fleetVehicles,
    loading: sources.some(source => source.status === "loading"),
    failed: sources.filter(source => source.status === "error"),
    lastUpdated: Math.max(0, ...sources.map(source => source.updatedAt ?? 0)) || null,
    refetch: () => { void jobs.refetch(); void fleet.refetch(); void delivery.refetch(); if (includeEvents) void events.refetch(); }
  };
}

export const CATEGORY_UNIT: Record<AttentionCategory, string> = {
  unassigned: "job", tracker: "job", proof: "job", evidence: "job", invoice: "job", charge: "job", delivery: "job", fleet: "vehicle"
};

export interface AttentionGroup { category: AttentionCategory; count: number; severity: AttentionSeverity; items: AttentionItem[] }

/** One row per issue type. Categories overlap (a job can be late AND unassigned),
 *  so groups are never summed into a single "total issues" figure. */
export function groupAttention(items: AttentionItem[]): AttentionGroup[] {
  const groups = new Map<AttentionCategory, AttentionGroup>();
  for (const item of items) {
    const group = groups.get(item.category) ?? { category: item.category, count: 0, severity: item.severity, items: [] };
    group.count += 1;
    group.items.push(item);
    if (SEVERITY_ORDER[item.severity] < SEVERITY_ORDER[group.severity]) group.severity = item.severity;
    groups.set(item.category, group);
  }
  return Array.from(groups.values()).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count);
}
