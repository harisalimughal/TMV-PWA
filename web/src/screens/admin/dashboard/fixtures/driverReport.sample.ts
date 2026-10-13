import { DateTime } from "luxon";
import { manualRoadFee } from "../components/ManualRoadChargeCard";
import type { DriverReport, DriverReportJob, ReportPayments, ReportSummary, ReportVisit, ReportCharge, ReportLiability, ReportRoadAlert } from "../driverReport.types";

const payments = (cash: number, card = 0, link = 0, invoice = 0): ReportPayments => ({ byMethod: { Cash: cash, Card: card, Link: link, "Bank Transfer": 0, Invoice: invoice, Unknown: 0 }, knownCollectedPence: cash + card + link, collectedPence: cash + card + link, invoicePence: invoice, issues: [] });
export const sampleJobs: DriverReportJob[] = Array.from({ length: 36 }, (_, index) => {
  const day = 5 + index % 7, start = `2026-10-${String(day).padStart(2, "0")}T09:00:00Z`, finish = `2026-10-${String(day).padStart(2, "0")}T11:30:00Z`;
  const congestion = index % 4 === 1 || index % 4 === 3 ? 1800 : 0, tunnel = index % 4 === 2 || index % 4 === 3 ? 1360 : 0;
  const jobId = `DEMO-${String(index + 1).padStart(3, "0")}`, expected = 25500 + congestion + tunnel, pending = index % 8 === 7, invoice = index % 9 === 8;
  const manualAmount = invoice ? 0 : expected + (index % 6 === 0 ? -3000 : index % 6 === 1 ? 1500 : 0);
  const system = invoice ? payments(0, 0, 0, expected) : payments(Math.round(expected * .4), Math.round(expected * .4), Math.round(expected * .2));
  const manual = pending ? null : invoice ? payments(0, 0, 0, expected) : payments(Math.round(manualAmount * .4), Math.round(manualAmount * .4), Math.round(manualAmount * .2));
  return { jobId, jobDetailsUrl: `/admin?section=jobs&job=${jobId}`, status: "COMPLETED", customer: { name: `Sample Customer ${index + 1}`, email: "sample@example.test", phone: "Not supplied" }, pickup: "Sample pickup, London", dropoff: "Sample delivery, London",
    bookedStart: start, bookedFinish: start.replace("09:00", "10:30"), actualStart: start, actualFinish: finish, operationalDate: start,
    timings: { onMyWayAt: start.replace("09:00", "08:40"), trackerArrivalAt: start.replace("09:00", "08:58"), proofPhotoAt: start, vanLoadedAt: start.replace("09:00", "09:20"), emptyVanAt: finish, customerSignedAt: finish.replace("11:30", "11:35"),
      trackerDropoffArrivalAt: start.replace("09:00", "10:30"), trackerDropoffDepartureAt: finish.replace("11:30", "11:45"),
      proofPhotoSource: "captured", vanLoadedSource: "captured", emptyVanSource: "captured" },
    duration: { bookedMinutes: 90, allocatedMinutes: 120, workingMinutes: 150, manualMinutes: pending ? null : index % 4 === 0 ? 155 : 150, differenceMinutes: pending ? null : index % 4 === 0 ? -5 : 0, overtimeMinutes: 30, arrivalDelayMinutes: index % 3 * 5, arrivalSource: "verified-gps" },
    finance: { invoiceJob: invoice, extraCharges: [{ label: "London Congestion charge", amountPence: congestion, basis: "Included in job total" }, { label: "Tunnel Charges", amountPence: tunnel, basis: "Included in job total" }].filter(row => row.amountPence > 0), systemCalculatedPence: expected, acceptedPence: expected, expectedPence: expected, adjustmentNote: null, systemPayments: system, manualPayments: manual, separatePrepaymentPence: 0,
      recognizedCollectionPence: manual ? manualAmount : null, signedDifferencePence: pending ? null : expected - manualAmount, outstandingPence: pending ? null : Math.max(0, expected - manualAmount), excessCollectionPence: pending ? null : Math.max(0, manualAmount - expected),
      systemVsManualCollectionDifferencePence: manual ? system.collectedPence! - manual.collectedPence! : null, paymentMethodDifferences: index % 6 === 0 ? ["Cash", "Card"] : [], prepaymentsVerified: true, knownCollectionDifferencePence: pending ? null : expected - manualAmount,
      basePence: 20000, congestionPence: congestion, tunnelPence: tunnel, overtimePence: 5500 },
    manualDetails: pending ? null : { startTime: start, endTime: finish.replace("11:30", "11:35"), helperName: index % 2 ? "Sample Helper" : "", helperHours: index % 2 ? 2 : 0, amountCollectedPence: manualAmount, submittedAt: finish,
      paymentBreakdown: Object.entries(manual!.byMethod).filter(([, value]) => value > 0).map(([method, amountPence]) => ({ method, amountPence })) }, manualStatus: pending ? "pending-submission" : "submitted-locked", reviewSent: index % 3 !== 0,
    issues: pending ? ["Manual details are missing; outstanding and manual hours are unknown."] : [],
    movement: { onJob: { coverage: index % 4 ? "sampled" : "partial", movingSeconds: 3600, stationarySeconds: 5400, idleSeconds: 1200, engineOffSeconds: 2400, unknownSeconds: index % 4 ? 0 : 600 }, approach: null },
    roadCharges: { flags: index % 6 === 0 ? [{ code: "Missing charge", type: "congestion", source: "manual", reason: "Observed job fee differs from the reported manual charge.", evidenceIds: [`visit-${index}`] }] : [],
      comparisons: [{ type: "congestion", observedExpectedPence: congestion, jobRecordedPence: congestion, manualReportedPence: index % 6 === 0 ? 0 : congestion }, { type: "tunnel", observedExpectedPence: null, jobRecordedPence: tunnel, manualReportedPence: tunnel }] }
  };
});
function summary(jobs: DriverReportJob[]): ReportSummary {
  const sum = (select: (job: DriverReportJob) => number | null | undefined) => jobs.reduce((total, job) => total + (select(job) ?? 0), 0);
  const helpers = jobs.filter(job => job.manualDetails?.helperName);
  const missingManual = jobs.filter(job => !job.manualDetails).length;
  const manualRoadTotals = (type: "tunnel" | "congestion") => {
    const amounts = jobs.map(job => manualRoadFee(job.manualDetails, type));
    return { knownPence: amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0), knownJobs: amounts.filter(amount => amount !== null).length,
      missingJobs: missingManual, unavailableJobs: amounts.filter(amount => amount === null).length - missingManual };
  };
  const driverCollection = sum(job => job.finance.acceptedPence), manualEntries = sum(job => job.manualDetails?.amountCollectedPence);
  const jobFlowTotal = sum(job => Object.values(job.finance.systemPayments.byMethod).reduce((total, amount) => total + amount, 0));
  return { assignedJobs: jobs.length, completedJobs: jobs.length, cancelledJobs: 0, expectedKnownPence: sum(job => job.finance.expectedPence), expectedUnknownJobs: 0,
    scheduledMinutesKnown: sum(job => job.duration.bookedMinutes), scheduledMinutesUnknownJobs: jobs.filter(job => job.duration.bookedMinutes === null).length,
    financialBreakdown: { basePence: sum(job => job.finance.basePence), invoiceJobs: jobs.filter(job => job.finance.invoiceJob).length,
      extraCharges: ["London Congestion charge", "Tunnel Charges"].map(label => ({ label, basis: "Included in job total", amountPence: sum(job => job.finance.extraCharges?.find(row => row.label === label)?.amountPence) })).filter(row => row.amountPence > 0) },
    manualRoadChargeTotals: { tunnel: manualRoadTotals("tunnel"), congestion: manualRoadTotals("congestion") },
    roadChargeTotals: { congestionPence: jobs.length > 0 && jobs.every(job => job.finance.congestionPence === null) ? null : sum(job => job.finance.congestionPence), tunnelPence: jobs.length > 0 && jobs.every(job => job.finance.tunnelPence === null) ? null : sum(job => job.finance.tunnelPence), congestionUnknownJobs: jobs.filter(job => job.finance.congestionPence === null).length, tunnelUnknownJobs: jobs.filter(job => job.finance.tunnelPence === null).length },
    paymentCards: { basis: "driver-charged-minus-manual-form-collections", totalChargesPence: sum(job => job.finance.systemCalculatedPence), totalChargeUnknownJobs: 0,
      driverCollectionPence: driverCollection, driverCollectionUnknownJobs: 0, manualEntriesPence: missingManual ? null : manualEntries,
      manualEntriesKnownPence: manualEntries, manualEntryMissingJobs: missingManual, manualEntryUnknownJobs: missingManual, outstandingPence: missingManual ? null : driverCollection - manualEntries,
      adjustmentReasons: jobs.filter(job => !!job.finance.adjustmentNote).map(job => ({ jobId: job.jobId, reason: job.finance.adjustmentNote!, calculatedPence: job.finance.systemCalculatedPence, driverCollectionPence: job.finance.acceptedPence })),
      jobFlowTotalPence: jobFlowTotal, jobFlowTotalKnownPence: jobFlowTotal, jobFlowUnknownJobs: 0, jobFlowUnverifiedJobIds: [] },
    systemKnownCollectionsPence: sum(job => job.finance.systemPayments.knownCollectedPence), unknownSystemCollectionJobs: 0, recognizedKnownCollectionsPence: sum(job => job.finance.recognizedCollectionPence), outstandingKnownPence: sum(job => job.finance.outstandingPence), outstandingCompletePence: jobs.some(job => !job.manualDetails) ? null : sum(job => job.finance.outstandingPence), excessCollectionKnownPence: sum(job => job.finance.excessCollectionPence), outstandingUnknownJobs: jobs.filter(job => !job.manualDetails).length, pendingManualJobs: jobs.filter(job => !job.manualDetails).length,
    systemPaymentsByMethodPence: Object.fromEntries(["Cash", "Card", "Link", "Bank Transfer", "Invoice", "Unknown"].map(method => [method, sum(job => job.finance.systemPayments.byMethod[method])])), workingMinutesKnown: sum(job => job.duration.workingMinutes), workingMinutesUnknownJobs: 0, manualMinutesKnown: sum(job => job.duration.manualMinutes), manualMinutesUnknownJobs: jobs.filter(job => !job.manualDetails).length,
    overtimeChargesPence: jobs.some(job => job.finance.overtimePence === null) ? null : sum(job => job.finance.overtimePence), overtimeChargesUnknownJobs: jobs.filter(job => job.finance.overtimePence === null).length,
    overtimeMinutesUnknownJobs: jobs.filter(job => job.duration.overtimeMinutes === null).length,
    overtimeMinutesKnown: sum(job => job.duration.overtimeMinutes), arrivalDelayMinutesKnown: sum(job => job.duration.arrivalDelayMinutes), reviewSentJobs: jobs.filter(job => job.reviewSent).length, reviewNotSentJobs: jobs.filter(job => !job.reviewSent).length,
    helperHoursKnown: helpers.length * 2, helpers: helpers.length ? [{ name: "Sample Helper", hours: helpers.length * 2, jobs: helpers.length }] : [], discrepancies: jobs.filter(job => job.duration.differenceMinutes !== null && job.duration.differenceMinutes <= -30).length,
    movingKnownSeconds: sum(job => job.movement?.onJob.movingSeconds), movingUnknownJobs: jobs.filter(job => job.movement?.onJob.movingSeconds === null).length, movingPartialJobs: jobs.filter(job => job.movement?.onJob.coverage === "partial").length };
}
export async function sampleDriverReport(initials: string, query: Record<string, string | number>): Promise<DriverReport> {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "error") throw new Error("Synthetic report load failure");
  const rawFrom = String(query.from), rawTo = String(query.to);
  const from = DateTime.fromISO(rawFrom, { zone: "Europe/London" }).toUTC().toISO()!, to = /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? DateTime.fromISO(rawTo, { zone: "Europe/London" }).plus({ days: 1 }).toUTC().toISO()! : rawTo;
  const unavailable = params.get("mode") === "nogps";
  const rows = params.get("mode") === "empty" ? [] : sampleJobs.filter(job => Date.parse(job.operationalDate!) >= Date.parse(from) && Date.parse(job.operationalDate!) < Date.parse(to)).map(job => unavailable ? { ...job, movement: { onJob: { coverage: "unavailable", movingSeconds: null, stationarySeconds: null, idleSeconds: null, engineOffSeconds: null, unknownSeconds: 9000 }, approach: null } } : job);
  const paginate = <T>(items: T[], key: string) => { const page = Number(query[`${key}Page`] ?? 1), pageSize = Number(query.pageSize ?? 25); return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }; };
  const allVisits: ReportVisit[] = rows.slice(0, 18).map((job, index) => ({ id: `visit-${index}`, imei: "SAMPLE", scheme: index % 3 ? "congestion" : "dartford", entryAt: job.actualStart, firstInsideAt: job.actualStart!, exitAt: job.actualFinish, durationSeconds: 900, entryObserved: true, physicalCrossingConfirmed: index % 3 === 0 && index % 2 === 0, status: "observed-pair", tunnelName: index % 3 ? undefined : "Sample tunnel", direction: "A to B", zoneNames: [index % 3 ? "Congestion zone" : "Sample tunnel approach"], issues: index % 2 ? ["Geofence passage is not proof of a physical tunnel crossing."] : [], association: { jobId: job.jobId, driverInitials: initials }, proofFrom: job.actualStart!, proofTo: job.actualFinish! }));
  const allCharges: ReportCharge[] = allVisits.filter(visit => visit.scheme === "congestion" || visit.physicalCrossingConfirmed).map((visit, index) => ({ id: `charge-${index}`, jobId: visit.association.jobId!, type: visit.scheme === "congestion" ? "congestion" : "tunnel", scheme: visit.scheme, occurredAt: visit.entryAt!, londonDate: visit.entryAt!.slice(0, 10), expectedPence: visit.scheme === "congestion" ? 1800 : 1360, authorityExpectedPence: null, tunnelName: visit.tunnelName || null, direction: visit.direction || null, visitIds: [visit.id], authorityIssue: "Authority tariff/account evidence is not verified; customer fees are separate." }));
  const scoped = (scheme: string) => query.activityScheme === "all" || !query.activityScheme || (query.activityScheme === "congestion" ? scheme === "congestion" : scheme !== "congestion");
  const visits = allVisits.filter(visit => scoped(visit.scheme)), charges = allCharges.filter(charge => scoped(charge.scheme));
  const roadAlerts: ReportRoadAlert[] = unavailable ? [] : visits.map(visit => {
    const dt = DateTime.fromISO(visit.entryAt!).setZone("Europe/London"), minutes = dt.hour * 60 + dt.minute;
    const congestion = visit.scheme === "congestion", start = congestion ? dt.weekday <= 5 ? 420 : 720 : 360;
    const chargeable = minutes >= start && minutes < (congestion ? 1080 : 1320);
    return { id: visit.id, type: congestion ? "congestion" : "tunnel", scheme: visit.scheme,
      zone: visit.zoneNames.join(", "), enteredAt: visit.entryAt!, exitedAt: visit.exitAt,
      durationSeconds: visit.exitAt ? (Date.parse(visit.exitAt) - Date.parse(visit.entryAt!)) / 1000 : null, jobId: visit.association.jobId,
      linkBasis: "recorded-device", inChargeableHours: chargeable, chargeable, estimatedPence: chargeable ? congestion ? 1800 : 1360 : 0, rateBasis: "Job pricing snapshot",
      alerts: [{ id: `entry-${visit.id}`, type: "entry", description: `Entered ${visit.zoneNames[0]}`, occurredAt: visit.entryAt }, { id: `exit-${visit.id}`, type: "exit", description: `Exited ${visit.zoneNames[0]}`, occurredAt: visit.exitAt }] };
  });
  const liabilities: ReportLiability[] = rows.slice(0, 3).map((job, index) => ({ id: `liability-${index}`, jobId: job.jobId, jobDetailsUrl: job.jobDetailsUrl, type: index ? "damage" : "parking", classification: "notice-or-risk-evidence", description: index ? "Unprotected items risk report" : "Parking restriction notice", date: job.actualStart, dateBasis: "submission", amountPence: null, responsibleParty: "unknown", status: "open", issues: ["Notice/signature evidence does not establish a monetary liability."], photos: [], signature: null, sourceRef: `sample:${index}` }));
  const groups = new Map<string, DriverReportJob[]>();
  for (const job of rows) {
    const dt = DateTime.fromISO(job.operationalDate!).setZone("Europe/London");
    const period = (query.groupBy === "week" ? dt.startOf("week") : dt).toFormat(query.groupBy === "month" ? "yyyy-MM" : "yyyy-MM-dd");
    groups.set(period, [...(groups.get(period) ?? []), job]);
  }
  return { version: "driver-report-v1", generatedAt: "2026-10-09T12:00:00Z", driver: { initials, name: params.get("mode") === "long" ? "Sample Driver With A Very Long Display Name" : "Sample Driver", email: "sample@example.test", hasCurrentAccount: false, currentVehicleImei: "SAMPLE" }, range: { from, to }, summary: summary(rows), trends: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([period, jobs]) => ({ period, ...summary(jobs) })), visits: paginate(unavailable ? [] : visits, "visits"), charges: paginate(unavailable ? [] : charges, "charges"),
    jobs: paginate(rows.map(job => ({ ...job, roadAlerts: roadAlerts.filter(row => row.jobId === job.jobId), alertHistoryTruncated: false })), "jobs"),
    roadAlerts: paginate(roadAlerts, "roadAlerts"), roadAlertSummary: { entries: roadAlerts.length, chargeableEntries: roadAlerts.filter(row => row.chargeable).length, estimatedKnownPence: roadAlerts.reduce((sum, row) => sum + row.estimatedPence!, 0), unpricedEntries: 0 },
    events: paginate(unavailable ? [] : visits.map(visit => ({ _id: `event-${visit.id}`, type: "entry", occurredAt: visit.entryAt, zoneName: visit.zoneNames[0], scheme: visit.scheme, association: { jobId: visit.association.jobId } })), "events"), liabilities: paginate(liabilities, "liabilities"),
    liabilitySummary: { records: liabilities.length, knownTotalPence: 0, completeTotalPence: liabilities.length ? null : 0, unknownAmountCount: liabilities.length, unverifiedEvidenceCount: liabilities.length, knownUnresolvedPence: 0, duplicateFinancialSourceCount: 0, conflictingFinancialSourceCount: 0 },
    gpsSummary: { coverage: unavailable ? "unavailable" : "partial", providerCoverage: "unknown", truncated: false, portalIssue: "Sample portal evidence only; no live GPS queried.", observedEventCount: unavailable ? 0 : allVisits.length, congestionEntries: allVisits.filter(visit => visit.scheme === "congestion").length, confirmedTunnelCrossings: unavailable ? null : allVisits.filter(visit => visit.physicalCrossingConfirmed).length, inferredVisits: 2, observedChargeKnownPence: allCharges.reduce((sum, charge) => sum + (charge.expectedPence ?? 0), 0), unknownChargeAmounts: 0, chargeVerificationCounts: { "Needs verification": 2 } },
    activitySummary: { scheme: String(query.activityScheme ?? "all"), observedVisits: unavailable ? 0 : visits.length, observedEntries: unavailable ? 0 : visits.length, confirmedCrossings: unavailable ? null : visits.filter(visit => visit.physicalCrossingConfirmed).length, chargeableObligations: unavailable ? 0 : charges.length, knownCustomerPence: charges.reduce((sum, charge) => sum + (charge.expectedPence ?? 0), 0), unknownChargeAmounts: 0 }, contextJobs: [], meta: { financialTotalsCoverAllMatchingJobs: true, monetaryLiabilityIntakeEnabled: false, adminManualEditingEnabled: false } };
}
