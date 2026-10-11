import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { ScenarioSubmissionDoc } from "../db/scenario.repo";
import type { Job } from "../jobs/job.types";

export const LIABILITY_STATUSES = ["open", "disputed", "paid", "waived", "resolved"] as const;
export type LiabilityStatus = typeof LIABILITY_STATUSES[number];
export type LiabilityType = "parking" | "damage" | "penalty" | "fine" | "other";
export interface LiabilityStatusEvent { id: string; from: LiabilityStatus; to: LiabilityStatus; at: string; actor: string; note: string }
/** Existing approved structured imports only. Driver form fields never populate this. */
export interface ApprovedLiabilityFinancialSource {
  origin: "approved-import";
  reference: string;
  approvedBy: string;
  approvedAt: string;
  amountPence: number;
  description?: string;
  type: LiabilityType;
  responsibleParty: "customer" | "driver" | "company" | "other" | "unknown";
  incidentAt?: string;
  statusHistory?: LiabilityStatusEvent[];
}
export interface LiabilityRecord {
  id: string;
  version: 1;
  sourceRef: string;
  sourceIdentity: "mongo-id" | "legacy-fingerprint";
  sourceKind: "parking" | "liability";
  sourceHash: string;
  immutableSourceHash: string;
  jobId: string;
  jobDetailsUrl: string;
  driver: { actor: string; initials: string | null; name: string | null; vehicleImei: string | null; provenance: "submission-snapshot" | "legacy-submitter" };
  type: LiabilityType;
  classification: "notice-or-risk-evidence" | "approved-financial-record";
  description: string;
  reportedAt: string | null;
  incidentAt: string | null;
  dateBasis: "approved-incident" | "submission" | "unknown";
  date: string | null;
  checkpoint: string | null;
  amountPence: number | null;
  responsibleParty: ApprovedLiabilityFinancialSource["responsibleParty"];
  status: LiabilityStatus;
  statusHistory: LiabilityStatusEvent[];
  financialSource: ApprovedLiabilityFinancialSource | null;
  photos: Array<{ url: string; meta?: ScenarioSubmissionDoc["signatureMeta"] }>;
  signature: { url: string; meta?: ScenarioSubmissionDoc["signatureMeta"] } | null;
  issues: string[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function liabilityTime(value: unknown): string | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toUTC().toISO() : null;
}

export function validateLiabilityHistory(events: LiabilityStatusEvent[] = []): { status: LiabilityStatus; history: LiabilityStatusEvent[] } {
  if (!Array.isArray(events) || events.length > 100) throw new RangeError("Invalid liability status history.");
  let status: LiabilityStatus = "open", last = -Infinity;
  const ids = new Set<string>();
  const history: LiabilityStatusEvent[] = [];
  for (const event of events) {
    const at = liabilityTime(event?.at);
    if (!event || typeof event.id !== "string" || !event.id.trim() || ids.has(event.id) || !at || Date.parse(at) < last ||
      event.from !== status || !LIABILITY_STATUSES.includes(event.to) || event.to === status || typeof event.actor !== "string" || !event.actor.trim() || typeof event.note !== "string" || !event.note.trim() ||
      (["paid", "waived", "resolved"].includes(status) && event.to !== "open")) throw new RangeError("Liability status transition requires ordered, unique source events and an audit actor/note.");
    ids.add(event.id); status = event.to; last = Date.parse(at);
    history.push({ ...event, at });
  }
  return { status, history };
}

export function buildLiabilityRecord(source: ScenarioSubmissionDoc, job: Job): LiabilityRecord | null {
  if (source.jobId !== job.jobId || !["parking", "liability"].includes(source.scenario)) return null;
  const rawId = typeof source._id === "string" ? source._id : source._id?.toHexString();
  const body = { jobId: source.jobId, scenario: source.scenario, driver: source.driver, submittedAt: source.submittedAt,
    fields: source.fields, photoUrls: source.photoUrls, photoMeta: source.photoMeta, signatureUrl: source.signatureUrl, signatureMeta: source.signatureMeta, driverSnapshot: source.driverSnapshot, financialSource: source.liabilityFinancial };
  const sourceHash = hash(body);
  const immutableSourceHash = hash({ ...body, financialSource: source.liabilityFinancial ? { ...source.liabilityFinancial, statusHistory: undefined } : undefined });
  const sourceRef = rawId ? `scenario:${rawId}` : `scenario-fingerprint:${sourceHash}`;
  const issues: string[] = [];
  const reportedAt = liabilityTime(source.submittedAt);
  if (!reportedAt) issues.push("Submission timestamp is missing or lacks a valid explicit timezone.");
  const snapshot = source.driverSnapshot;
  if (!snapshot) issues.push("Historical driver initials/name are unavailable; the original submitter is preserved without guessing from the current roster.");
  let financial: ApprovedLiabilityFinancialSource | null = null;
  let resolution: ReturnType<typeof validateLiabilityHistory> = { status: "open", history: [] };
  if (source.liabilityFinancial) {
    const candidate = source.liabilityFinancial;
    try {
      if (candidate.origin !== "approved-import" || !candidate.reference?.trim() || !candidate.approvedBy?.trim() || !liabilityTime(candidate.approvedAt) ||
        !Number.isSafeInteger(candidate.amountPence) || candidate.amountPence < 0 || candidate.amountPence > 100_000_000 ||
        !["parking", "damage", "penalty", "fine", "other"].includes(candidate.type) ||
        !["customer", "driver", "company", "other", "unknown"].includes(candidate.responsibleParty) ||
        (candidate.description !== undefined && (typeof candidate.description !== "string" || candidate.description.length > 4000)) ||
        (candidate.incidentAt !== undefined && !liabilityTime(candidate.incidentAt))) throw new RangeError("Invalid approved financial source.");
      resolution = validateLiabilityHistory(candidate.statusHistory);
      financial = { ...candidate, reference: candidate.reference.trim(), approvedBy: candidate.approvedBy.trim() };
    } catch { issues.push("Approved financial metadata is invalid; amount, responsibility and status remain unverified."); }
  }
  if (!financial) issues.push("Notice/signature/risk categories do not establish an actual fine, damage cost or legal responsibility. No amount was captured by this form.");
  const incidentAt = financial?.incidentAt ? liabilityTime(financial.incidentAt) : null;
  return { id: hash(["liability-v1", sourceRef]), version: 1, sourceRef, sourceIdentity: rawId ? "mongo-id" : "legacy-fingerprint", sourceHash, immutableSourceHash,
    sourceKind: source.scenario as "parking" | "liability", jobId: job.jobId, jobDetailsUrl: `/admin?section=jobs&job=${encodeURIComponent(job.jobId)}`,
    driver: { actor: source.driver, initials: snapshot?.initials || null, name: snapshot?.fullName || null, vehicleImei: snapshot?.imei || null, provenance: snapshot ? "submission-snapshot" : "legacy-submitter" },
    type: financial?.type ?? (source.scenario === "parking" ? "parking" : "damage"), classification: financial ? "approved-financial-record" : "notice-or-risk-evidence",
    description: financial ? financial.description || `${financial.type} recorded by approved source ${financial.reference}.` : source.scenario === "parking" ? "Parking restriction/liability notice recorded; no confirmed penalty inferred." : source.fields.damage_categories || "Liability/risk evidence reported.",
    reportedAt, incidentAt, dateBasis: incidentAt ? "approved-incident" : reportedAt ? "submission" : "unknown", date: incidentAt ?? reportedAt,
    checkpoint: source.fields.reported_at || source.fields["Reported At"] || null, amountPence: financial?.amountPence ?? null,
    responsibleParty: financial?.responsibleParty ?? "unknown", status: resolution.status, statusHistory: resolution.history, financialSource: financial,
    photos: source.photoUrls.map((url, index) => ({ url, meta: source.photoMeta?.[index] })), signature: source.signatureUrl ? { url: source.signatureUrl, meta: source.signatureMeta } : null, issues };
}

export function approvedStatusExtension(previous: LiabilityRecord, next: LiabilityRecord): boolean {
  return previous.id === next.id && previous.immutableSourceHash === next.immutableSourceHash && !!previous.financialSource && !!next.financialSource &&
    next.statusHistory.length > previous.statusHistory.length && previous.statusHistory.every((event, index) => canonical(event) === canonical(next.statusHistory[index]));
}

export function summarizeLiabilities(rows: LiabilityRecord[]) {
  const unique = [...new Map(rows.map(row => [row.id, row])).values()];
  const groups = new Map<string, LiabilityRecord[]>();
  for (const row of unique) {
    const ref = row.financialSource ? `approved:${row.financialSource.reference}` : `evidence:${row.id}`;
    groups.set(ref, [...(groups.get(ref) ?? []), row]);
  }
  let duplicateFinancialSourceCount = 0, conflictingFinancialSourceCount = 0;
  const monetaryRows: LiabilityRecord[] = [];
  for (const group of groups.values()) {
    duplicateFinancialSourceCount += group.length - 1;
    const first = group[0];
    if (group.some(row => row.amountPence !== first.amountPence || row.status !== first.status || row.responsibleParty !== first.responsibleParty)) conflictingFinancialSourceCount++;
    else monetaryRows.push(first);
  }
  const known = monetaryRows.filter(row => row.amountPence !== null);
  const sum = (records: LiabilityRecord[]) => records.reduce((total, row) => total + row.amountPence!, 0);
  return { records: unique.length, knownAmountCount: unique.filter(row => row.amountPence !== null).length, unknownAmountCount: unique.filter(row => row.amountPence === null).length,
    unverifiedEvidenceCount: unique.filter(row => row.classification === "notice-or-risk-evidence").length,
    duplicateFinancialSourceCount, conflictingFinancialSourceCount, knownTotalPence: sum(known), completeTotalPence: known.length === unique.length ? sum(known) : null,
    knownUnresolvedPence: sum(known.filter(row => ["open", "disputed"].includes(row.status))),
    byStatus: Object.fromEntries(LIABILITY_STATUSES.map(status => [status, { records: unique.filter(row => row.status === status).length, knownPence: sum(known.filter(row => row.status === status)) }])),
    includedInCustomerCollections: false, includedInGpsCharges: false };
}
