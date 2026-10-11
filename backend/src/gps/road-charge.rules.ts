import { DateTime } from "luxon";
import { gpsId } from "./gps.parse";
import type { GpsVisit } from "./gps.types";
import { ExtraChargeType, type Job } from "../jobs/job.types";
import type { DriverJobSummaryDoc } from "../db/driver-job-summary.repo";

export const ROAD_RULE_VERSION = "tmv-customer-road-v1" as const;
export type RoadChargeType = "congestion" | "tunnel";
export interface RoadTariffSnapshot {
  version: typeof ROAD_RULE_VERSION;
  effectiveFrom: string;
  capturedAt: string;
  congestionPence: number | null;
  tunnelPence: number | null;
  source: "pricing-settings";
}
export interface RoadObligation {
  id: string;
  jobId: string;
  driverInitials: string;
  imei: string;
  type: RoadChargeType;
  scheme: GpsVisit["scheme"];
  occurredAt: string;
  londonDate: string;
  proofFrom: string;
  proofTo: string;
  visitIds: string[];
  expectedPence: number | null;
  tariff: RoadTariffSnapshot | null;
  tunnelName: string | null;
  direction: string | null;
  authorityKey: string;
  authorityExpectedPence: null;
  authorityIssue: string;
}
export type RoadFlagCode = "Missing charge" | "Amount mismatch" | "Manual only" | "Outside chargeable hours" | "Duplicate allocation" | "Needs verification";
export interface RoadFlag { code: RoadFlagCode; type: RoadChargeType; source: "gps" | "job" | "manual" | "allocation"; reason: string; evidenceIds: string[] }

/** Company customer-fee policy, not an authority tariff. Start inclusive, end exclusive. */
export function roadWindow(type: RoadChargeType, instant: string): { chargeable: boolean | null; londonDate: string | null; localTime: string | null } {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(instant)) return { chargeable: null, londonDate: null, localTime: null };
  const dt = DateTime.fromISO(instant, { setZone: true }).setZone("Europe/London");
  if (!dt.isValid) return { chargeable: null, londonDate: null, localTime: null };
  const minutes = dt.hour * 60 + dt.minute;
  const start = type === "tunnel" ? 360 : dt.weekday <= 5 ? 420 : 720;
  return { chargeable: minutes >= start && minutes < (type === "tunnel" ? 1320 : 1080), londonDate: dt.toISODate(), localTime: dt.toISO() };
}

export function parseRoadRate(value: string): number | null {
  const clean = String(value ?? "").trim().replace(/^£\s*/, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(pence) && pence <= 100_000_000 ? pence : null;
}

function recordedFee(job: Job, type: RoadChargeType): number | null {
  const selected = job.extraCharges?.includes(type === "congestion" ? ExtraChargeType.CONGESTION : ExtraChargeType.TUNNEL);
  if (job.chargeSnapshot) return type === "congestion" ? job.chargeSnapshot.congestionPence : job.chargeSnapshot.tunnelPence;
  return selected ? null : 0;
}

export function assessRoadCharges(input: { job: Job; visits: GpsVisit[]; coverage: string; manual: DriverJobSummaryDoc | null; recorded?: Record<RoadChargeType, number | null>; allocationConflicts?: RoadFlag[] }) {
  const { job, manual } = input;
  const flags: RoadFlag[] = [...(input.allocationConflicts ?? [])];
  const add = (code: RoadFlagCode, type: RoadChargeType, source: RoadFlag["source"], reason: string, evidenceIds: string[] = []) => flags.push({ code, type, source, reason, evidenceIds });
  const obligations: RoadObligation[] = [];
  const authorityReferences: RoadObligation[] = [];
  const activity: Array<{ visitId: string; type: RoadChargeType; occurredAt: string | null; chargeable: boolean | null; eligible: boolean; inJob: boolean; ownershipVerified: boolean; physicalConfirmed: boolean; reason: string }> = [];
  const seen = new Set<string>();
  const start = Date.parse(job.actualStart), end = Date.parse(job.actualFinish);
  const validJob = Number.isFinite(start) && Number.isFinite(end) && end >= start && job.actualStartSource !== "completion-fallback" && !["completion-fallback", "admin-manual"].includes(job.actualFinishSource ?? "");
  const tariff = job.roadTariffSnapshot ?? null;
  for (const visit of [...input.visits].sort((a, b) => a.firstInsideAt.localeCompare(b.firstInsideAt))) {
    const type: RoadChargeType = visit.scheme === "congestion" ? "congestion" : "tunnel";
    const at = type === "tunnel" ? visit.proofTo ?? null : visit.entryObserved ? visit.entryAt : null;
    const window = at ? roadWindow(type, at) : { chargeable: null, londonDate: null };
    const boundaryUncertain = type === "tunnel" && !!visit.proofFrom && window.chargeable !== null && roadWindow(type, visit.proofFrom).chargeable !== window.chargeable;
    const chargeable = boundaryUncertain ? null : window.chargeable;
    const owned = visit.association.jobId === job.jobId && visit.association.confidence === "recorded-assignment";
    const physical = type === "congestion" ? visit.entryObserved : visit.physicalCrossingConfirmed && !!visit.proofFrom && !!visit.proofTo;
    const inJob = !!at && validJob && Date.parse(at) >= start && Date.parse(at) < end &&
      (type === "congestion" || Date.parse(visit.proofFrom!) >= start);
    const eligible = owned && physical && inJob && chargeable === true;
    const reason = !owned ? "Historical job/device ownership needs verification." : !physical ? "Observed entry or confirmed physical crossing evidence is missing." : !inJob ? "Activity is outside recorded job boundaries or boundaries are unverified." : boundaryUncertain ? "Tunnel proof spans a charging-window boundary; exact crossing time needs verification." : chargeable === false ? "Outside the supplied London customer charging window." : chargeable === null ? "Occurrence time is unverified." : "Qualifying in-job activity during the supplied London window.";
    activity.push({ visitId: visit.id, type, occurredAt: at, chargeable, eligible, inJob, ownershipVerified: owned, physicalConfirmed: physical, reason });
    if (!eligible) {
      if (!owned || !physical || !validJob || boundaryUncertain) add("Needs verification", type, "gps", reason, [visit.id]);
      continue;
    }
    if (input.allocationConflicts?.some(flag => flag.evidenceIds.includes(visit.id))) continue;
    const overlap = type === "tunnel" ? obligations.find(row => row.type === "tunnel" && row.imei === visit.imei && row.scheme === visit.scheme &&
      Date.parse(row.proofFrom) < Date.parse(visit.proofTo!) && Date.parse(row.proofTo) > Date.parse(visit.proofFrom!)) : undefined;
    if (overlap) {
      overlap.visitIds = [...new Set([...overlap.visitIds, visit.id])];
      if (overlap.proofFrom !== visit.proofFrom || overlap.proofTo !== visit.proofTo) add("Needs verification", type, "gps", "Overlapping physical proofs are grouped as one crossing, not counted twice.", [visit.id]);
      continue;
    }
    const key = type === "congestion" ? gpsId([ROAD_RULE_VERSION, job.jobId, "congestion"]) : gpsId([ROAD_RULE_VERSION, visit.imei, visit.scheme, visit.proofFrom, visit.proofTo]);
    const prior = obligations.find(row => row.id === key);
    if (prior) {
      prior.visitIds = [...new Set([...prior.visitIds, visit.id])];
      authorityReferences.push({ ...prior, imei: visit.imei, scheme: visit.scheme, driverInitials: visit.association.driverInitials!, londonDate: window.londonDate!, occurredAt: at!,
        proofFrom: at!, proofTo: at!, authorityKey: gpsId(["authority", visit.imei, visit.scheme, window.londonDate]) });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const effective = tariff && Date.parse(tariff.effectiveFrom) <= Date.parse(at!);
    const rate = effective ? type === "congestion" ? tariff.congestionPence : tariff.tunnelPence : null;
    obligations.push({ id: key, jobId: job.jobId, driverInitials: visit.association.driverInitials!, imei: visit.imei, type, scheme: visit.scheme,
      occurredAt: at!, londonDate: window.londonDate!, proofFrom: type === "tunnel" ? visit.proofFrom! : at!, proofTo: at!, visitIds: [visit.id], expectedPence: rate,
      tariff: effective ? tariff : null, tunnelName: visit.tunnelName ?? null, direction: visit.direction ?? null,
      authorityKey: gpsId(["authority", visit.imei, visit.scheme, type === "congestion" ? window.londonDate : key]), authorityExpectedPence: null,
      authorityIssue: "Authority tariff is separate: vehicle class, payment/account, exemption and scheme/direction evidence have not been verified." });
    authorityReferences.push(obligations[obligations.length - 1]);
    if (rate === null) add("Needs verification", type, "gps", "No valid effective Pricing Settings snapshot; historical rates are not inferred from current settings.", [visit.id]);
  }
  const comparison = (type: RoadChargeType) => {
    const rows = obligations.filter(row => row.type === type);
    const uncertainOnly = !rows.length && flags.some(flag => flag.type === type && flag.source === "gps" && flag.code === "Needs verification" && flag.evidenceIds.length);
    const expected = !validJob || uncertainOnly || input.coverage === "unavailable" || input.allocationConflicts?.some(flag => flag.type === type) || rows.some(row => row.expectedPence === null) ? null : rows.reduce((sum, row) => sum + row.expectedPence!, 0);
    const recorded = input.recorded?.[type] ?? recordedFee(job, type);
    const manualRows = manual?.chargeItems?.filter(row => row.type === type);
    const manualPence = !manual ? null : manualRows ? manualRows.some(row => row.amountPence === null) ? null : manualRows.reduce((sum, row) => sum + row.amountPence!, 0)
      : type === "congestion" ? manual.congestionCharge ? manual.congestionChargePence : 0 : null;
    const evidence = rows.flatMap(row => row.visitIds);
    if (job.chargeSnapshot?.roadFeeSources?.[type] === "driver-selected-unverified") add("Needs verification", type, "job", "Job fee was driver-selected without qualifying GPS proof; it is not a verified GPS expectation.", evidence);
    if (input.coverage !== "sampled" || !validJob || !manual || recorded === null || manualPence === null) add("Needs verification", type, "gps", "Missing/partial GPS, unverified boundaries, absent manual details or unknown recorded amounts prevent a complete comparison.", evidence);
    for (const [source, amount] of [["job", recorded], ["manual", manualPence]] as const) {
      if (expected !== null && amount !== null && expected > amount) add(amount === 0 ? "Missing charge" : "Amount mismatch", type, source, `Observed expected fee ${expected}p exceeds recorded ${amount}p.`, evidence);
      if (expected !== null && amount !== null && expected > 0 && amount > expected) add("Amount mismatch", type, source, `Recorded ${amount}p differs from observed expected ${expected}p; incomplete GPS may omit activity.`, evidence);
      if (amount !== null && amount > 0 && rows.length === 0 && input.coverage !== "unavailable") {
        const outside = activity.filter(row => row.type === type && row.chargeable === false && row.inJob && row.ownershipVerified && row.physicalConfirmed);
        add(outside.length ? "Outside chargeable hours" : "Manual only", type, source, outside.length ? "A fee is reported but observed activity is outside the supplied charging window." : "Reported fee has no qualifying GPS obligation; this is a review flag, not proof of fraud.", outside.map(row => row.visitId));
      }
    }
    if (recorded !== null && manualPence !== null && recorded !== manualPence) add("Amount mismatch", type, "manual", `Job recorded ${recorded}p; driver manual details report ${manualPence}p.`, evidence);
    return { type, observedExpectedPence: expected, jobRecordedPence: recorded, manualReportedPence: manualPence, obligations: rows.length,
      evidenceScope: "observed-minimum-not-full-coverage", signedManualDifferencePence: expected !== null && manualPence !== null ? expected - manualPence : null };
  };
  const comparisons = [comparison("congestion"), comparison("tunnel")];
  return { jobId: job.jobId, ruleVersion: ROAD_RULE_VERSION, coverage: input.coverage, providerCoverage: "unknown", obligations, authorityReferences, activity, comparisons, flags,
    authorityExpectedPence: null, authorityIssue: "No verified authority tariffs configured; customer fees must not be counted as government road costs." };
}
