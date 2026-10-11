import { env } from "../config/env";
import { getSetting } from "../db/settings.repo";
import { ValidationError } from "../workflow/validation.engine";
import { fromPounds, toPounds } from "../utils/money";
import { calculateJobTimeBilling } from "./job-time-billing";
import { resolveJobTimeRate } from "./job-time-rate";
import { ExtraChargeType, JobStatus, type Job } from "./job.types";
import { gpsJobMonitoring } from "../gps/gps.monitoring";
import { assessRoadCharges } from "../gps/road-charge.rules";
import type { RoadChargeType } from "../gps/road-charge.rules";
import { reserveRoadObligation, roadAllocationConflict, saveAuthorityReferences } from "../gps/road-charge.repo";

async function roadComponents(job: Job, persist = false) {
  const rate = async (type: "congestion" | "tunnel") => {
    const frozen = job.roadTariffSnapshot;
    const value = frozen ? type === "congestion" ? frozen.congestionPence : frozen.tunnelPence : fromPounds(await getSetting(type === "congestion" ? "CONGESTION_CHARGE" : "TUNNEL_CHARGE", String(type === "congestion" ? env.congestionCharge : env.tunnelCharge)));
    if (value === null) throw new ValidationError("Road charge Pricing Settings rate requires verification before confirming this fee.");
    return value;
  };
  const components = { congestionPence: job.extraCharges.includes(ExtraChargeType.CONGESTION) ? await rate("congestion") : 0,
    tunnelPence: job.extraCharges.includes(ExtraChargeType.TUNNEL) ? await rate("tunnel") : 0,
    roadFeeSources: { congestion: job.extraCharges.includes(ExtraChargeType.CONGESTION) ? "driver-selected-unverified" : "none",
      tunnel: job.extraCharges.includes(ExtraChargeType.TUNNEL) ? "driver-selected-unverified" : "none" } as Record<RoadChargeType, "gps-observed" | "driver-selected-unverified" | "none">,
    roadEvidenceIds: [] as string[], confirmedTunnelCrossings: 0, roadRuleVersion: job.roadTariffSnapshot?.version };
  // Never reprice legacy jobs or convert unconfirmed geofence visits into tolls.
  if (!job.roadTariffSnapshot || !job.actualStart || !job.actualFinish || !job.gpsliveImei) return components;
  const monitoring = await gpsJobMonitoring(job.jobId);
  if (!monitoring || !("visits" in monitoring)) return components;
  const assessment = assessRoadCharges({ job, visits: monitoring.visits ?? [], coverage: monitoring.coverage, manual: null });
  for (const type of ["congestion", "tunnel"] as const) {
    const rows = assessment.obligations.filter(row => row.type === type);
    if (!rows.length) {
      const relevant = assessment.activity.filter(row => row.type === type);
      if (relevant.length && relevant.every(row => row.chargeable === false) && !assessment.flags.some(flag => flag.type === type && flag.code === "Needs verification" && flag.evidenceIds.some(id => relevant.some(row => row.visitId === id)))) {
        components[type === "congestion" ? "congestionPence" : "tunnelPence"] = 0;
        components.roadFeeSources[type] = "none";
      }
      continue;
    }
    if (rows.some(row => row.expectedPence === null)) throw new ValidationError("Confirmed road activity has an unknown tariff; verify Pricing Settings before payment.");
    for (const row of rows) {
      const conflict = persist ? await reserveRoadObligation(row) : await roadAllocationConflict(row);
      if (conflict) throw new ValidationError(conflict.reason);
    }
    components[type === "congestion" ? "congestionPence" : "tunnelPence"] = rows.reduce((total, row) => total + row.expectedPence!, 0);
    components.roadFeeSources[type] = "gps-observed";
    components.roadEvidenceIds.push(...rows.flatMap(row => row.visitIds));
    if (type === "tunnel") components.confirmedTunnelCrossings = rows.length;
  }
  if (persist) await saveAuthorityReferences(assessment.authorityReferences);
  return components;
}

const AFTER_TOTAL = new Set(["WAITING_PAYMENT", "WAITING_REVIEW_CHECK", "WAITING_REVIEW_SEND", "COMPLETED"]);

/** Never reprice a completed job or an older job whose customer total was already accepted. */
export async function prepareJobTimeBilling(job: Job, strict = false): Promise<void> {
  if (job.timeBilling) {
    if (strict && job.timeBilling.extraChargePence === null) throw new ValidationError("Overtime rate needs administrative verification before payment.");
    return;
  }
  if (job.timeBillingStatus === "legacy" || job.status === JobStatus.COMPLETED || AFTER_TOTAL.has(job.currentState)) {
    job.timeBillingStatus = "legacy";
    return;
  }
  const unverified = !job.actualStart || !job.actualFinish ||
    job.actualStartSource === "completion-fallback" ||
    job.actualFinishSource === "completion-fallback" || job.actualFinishSource === "admin-manual";
  if (unverified) {
    job.timeBillingStatus = "needs-verification";
    job.timeBillingIssue = "Recorded arrival and empty-van finish times are required for automatic overtime billing.";
    if (strict) throw new ValidationError(job.timeBillingIssue);
    return;
  }
  const packing = job.extraCharges.includes(ExtraChargeType.PACKING) || (job.bookingPackingService ??
    /\b(pack|packing)\b/i.test([job.extraRequest, job.rawTitle, job.rawDescription].join("\n")));
  const crewRate = job.crewSize === 1 ? env.crewRate1Man : job.crewSize === 2 ? env.crewRate2Man : env.crewRate3Man;
  const resolution = await resolveJobTimeRate({
    calendarText: job.extraChargeText || "", crewSize: job.crewSize, packing,
    defaults: { crewRatePounds: String(crewRate), packingRatePounds: String(env.packingRate), crewBillingUnit: env.crewBillingUnit },
    readSetting: getSetting
  });
  let calculation;
  try {
    calculation = calculateJobTimeBilling({
      bookedStart: job.bookedStart, bookedFinish: job.bookedFinish,
      actualStart: job.actualStart, actualFinish: job.actualFinish,
      rate: resolution.rate, partialBlockPolicy: "round-up"
    });
  } catch (error) {
    job.timeBillingStatus = "needs-verification";
    job.timeBillingIssue = error instanceof Error ? error.message : "Invalid billing times.";
    if (strict) throw new ValidationError(job.timeBillingIssue);
    return;
  }
  if (strict && calculation.extraChargePence === null) throw new ValidationError("Overtime rate needs administrative verification before payment.");
  job.timeBilling = {
    ...calculation, rateResolution: resolution, driverInitials: job.driverInitials,
    vehicleImei: job.gpsliveImei, capturedAt: new Date().toISOString()
  };
  job.timeBillingStatus = resolution.needsVerification ? "needs-verification" : "verified";
  job.timeBillingIssue = resolution.needsVerification ? "Calendar or settings rate requires verification; see the applied rate source." : undefined;
  job.overtimeMinutes = calculation.extraMinutes;
  if (calculation.extraChargePence !== null) job.overtimeCharge = toPounds(calculation.extraChargePence);
  job.actualMinutes = calculation.actualMinutes;
  job.differenceMinutes = calculation.actualMinutes - calculation.scheduledMinutes;
}

export async function calculateJobTotal(job: Job): Promise<number> {
  if (job.status === JobStatus.COMPLETED || (!job.timeBilling && (job.timeBillingStatus === "legacy" || AFTER_TOTAL.has(job.currentState)))) {
    return job.calculatedTotalCharges ?? job.totalCharges;
  }
  const snapshot = job.chargeSnapshot;
  const components = snapshot ?? await roadComponents(job);
  const congestion = components.congestionPence;
  const tunnel = components.tunnelPence;
  return ((snapshot?.basePence ?? fromPounds(job.basePrice)) + congestion + tunnel +
    (job.timeBilling?.extraChargePence ?? fromPounds(job.overtimeCharge))) / 100;
}

export async function freezeJobCharges(job: Job): Promise<void> {
  if (job.chargeSnapshot || job.timeBillingStatus === "legacy") return;
  job.chargeSnapshot = {
    basePence: fromPounds(job.basePrice),
    ...await roadComponents(job, true)
  };
}
