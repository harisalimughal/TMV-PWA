import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { getSetting } from "../db/settings.repo";
import { buildReportJob, reportTrends, reportPeriod, summarizeReportJobs } from "./driver-report.model";
import { loadDriverReportJobs, loadReportContextJobs, loadReportLiabilitySources, reportPrepaymentConflicts, ReportCapacityError } from "./driver-report.repo";
import { readGpsRange } from "../gps/gps.repo";
import { createGpsAssociator } from "../gps/gps.association";
import { reconstructGpsVisits } from "../gps/gps.visits";
import { parsePortalRules, verifyPortalTraversals } from "../gps/gps.portals";
import { gpsMovement } from "../gps/gps.movement";
import { assessRoadCharges } from "../gps/road-charge.rules";
import { buildLiabilityRecord, summarizeLiabilities } from "../liabilities/liability.model";
import { listDriverJobSummariesForJobs } from "../db/driver-job-summary.repo";
import { reportRoadAllocations } from "./report-road-allocations";
import { mergeRoadAllocation } from "../gps/road-charge.repo";
import { projectRoadAlerts, readReportAlerts, reportAlertRates, summarizeExpectedRoadCharges } from "./driver-road-alerts";
import { listEvidenceForJobs } from "../db/evidence.repo";
import type { EvidenceRecord } from "../jobs/job.types";
import { createReportReadCache } from "./report-read-cache";

interface DriverReportReadOptions { includeLiabilities?: boolean; includeGps?: boolean }

const reportCache = createReportReadCache<Awaited<ReturnType<typeof buildDriverReport>>>(30_000, 8,
  report => report.jobs.length + report.events.length + report.visits.length + report.roadAlerts.length + report.liabilities.length < 10_000);
export async function getDriverReport(initials: string, range: { from: string; to: string }, groupBy: "day" | "week" | "month" = "day", fresh = false, options: DriverReportReadOptions = {}) {
  if (fresh) return buildDriverReport(initials, range, groupBy, options);
  const key = JSON.stringify([initials, range.from, range.to, groupBy, options.includeLiabilities !== false, options.includeGps !== false]);
  return reportCache.get(key, () => buildDriverReport(initials, range, groupBy, options));
}

export async function buildDriverReport(initials: string, range: { from: string; to: string }, groupBy: "day" | "week" | "month" = "day", options: DriverReportReadOptions = {}) {
  const includeLiabilities = options.includeLiabilities !== false;
  const [profile, loadedSources] = await Promise.all([
    getDriverProfileByInitials(initials), loadDriverReportJobs(initials, range.from, range.to)
  ]);
  const sources = loadedSources.filter(source => source.job.status === "COMPLETED");
  const includeGps = options.includeGps !== false && sources.length > 0;
  const ownContext = includeGps ? await loadReportContextJobs(initials, range.from, range.to) : [];
  const [prepaymentConflicts, evidence, liabilityData] = await Promise.all([
    reportPrepaymentConflicts(sources.map(row => row.job)),
    listEvidenceForJobs(sources.map(row => row.job.jobId)),
    includeLiabilities ? loadReportLiabilitySources(sources.map(row => row.job.jobId), initials, profile?.email ?? null, range.from, range.to)
      : Promise.resolve({ sources: [], jobs: [], audits: [] })
  ]);
  const evidenceByJob = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    const group = evidenceByJob.get(record.jobId) ?? []; group.push(record); evidenceByJob.set(record.jobId, group);
  }
  const rows = sources.map(({ job, manual }) => buildReportJob(job, manual, prepaymentConflicts.includes(job.jobId), evidenceByJob.get(job.jobId) ?? []));
  const sourceByJob = new Map(sources.map(source => [source.job.jobId, source.job]));
  const rowByJob = new Map(rows.map(row => [row.jobId, row]));
  const ownJobs = [...sources.map(row => row.job), ...ownContext];
  const imeis = includeGps ? [...new Set(ownJobs.flatMap(job => [job.gpsliveImei, ...(job.gpsDeviceHistory ?? []).map(segment => segment.imei)]).filter((imei): imei is string => !!imei))] : [];
  if (imeis.length > 50) throw new ReportCapacityError("More than 50 historical trackers; narrow the report range.");
  const from = new Date(Date.parse(range.from) - 6 * 3600000).toISOString(), to = new Date(Date.parse(range.to) + 6 * 3600000).toISOString();
  // Legacy unpinned jobs still need the fleet fallback for unique historical driver/time matching.
  const linkableJobs = ownJobs.filter(job => job.status !== "CANCELLED" && (job.onMyWayAt || job.actualStart));
  const alertImeis = linkableJobs.every(job => job.gpsliveImei || job.gpsDeviceHistory?.length) ? imeis : undefined;
  const [sharedContext, gps, alertHistory, alertRates, portalSetting] = await Promise.all([
    imeis.length ? loadReportContextJobs(initials, from, to, imeis) : Promise.resolve([]),
    imeis.length ? readGpsRange(imeis, from, to, { forReport: true }) : Promise.resolve({ events: [], positions: [], drives: [], runs: [], truncated: false }),
    includeGps && linkableJobs.length && (profile || imeis.length) ? readReportAlerts(from, to, alertImeis) : Promise.resolve({ events: [], truncated: false }),
    includeGps ? reportAlertRates() : Promise.resolve({ congestion: null, tunnel: null }),
    includeGps ? getSetting("GPS_TUNNEL_PORTAL_RULES", "[]").catch(() => null) : Promise.resolve(null)
  ]);
  const contexts = [...new Map([...ownJobs, ...sharedContext].map(job => [job.jobId, job])).values()];
  // Keep unfinished contexts for ambiguity detection, but never expose their activity.
  const finishedJobIds = new Set(contexts.filter(job => job.status === "COMPLETED").map(job => job.jobId));
  const now = new Date().toISOString();
  const associate = createGpsAssociator(contexts, now);
  const roadAlerts = projectRoadAlerts([...gps.events, ...alertHistory.events], contexts, profile, initials, range, alertRates, now).filter(alert => !!alert.jobId && finishedJobIds.has(alert.jobId));
  const inRange = (instant: string | null | undefined) => !!instant && Date.parse(instant) >= Date.parse(range.from) && Date.parse(instant) < Date.parse(range.to);
  const events = gps.events.map(event => ({ ...event, association: associate(event) }))
    .filter(event => inRange(event.occurredAt) && event.association.driverInitials === initials && !!event.association.jobId && finishedJobIds.has(event.association.jobId));
  const zones = gps.runs.find(run => run.zoneSnapshot.length)?.zoneSnapshot ?? [];
  let visits = reconstructGpsVisits(gps.events, gps.positions, zones, contexts, now);
  let portalIssue: string | null = null;
  try {
    if (includeGps) {
      if (portalSetting === null) throw new RangeError("Portal geometry could not be read.");
      const rules = parsePortalRules(portalSetting);
      visits = verifyPortalTraversals(visits, gps.positions, zones, rules, contexts, now);
      if (!rules.length) portalIssue = "Physical tunnel portal geometry is not configured.";
    }
  } catch { portalIssue = "Portal geometry is invalid; physical crossings cannot be verified."; }
  const coverage = gps.truncated || gps.runs.some(run => run.status !== "queried") ? "partial" : gps.events.length || gps.positions.length ? "sampled" : "unavailable";
  const ownVisits = visits.filter(visit => visit.association.driverInitials === initials && !!visit.association.jobId && finishedJobIds.has(visit.association.jobId));
  const visitsByJob = new Map<string, typeof ownVisits>();
  for (const visit of ownVisits) if (visit.association.jobId) {
    const group = visitsByJob.get(visit.association.jobId) ?? []; group.push(visit); visitsByJob.set(visit.association.jobId, group);
  }
  const visitRows = ownVisits.filter(visit => inRange(visit.proofTo || visit.entryAt || visit.firstInsideAt));
  const [contextManuals, allocations] = await Promise.all([
    includeGps ? listDriverJobSummariesForJobs(contexts.map(job => job.jobId)) : Promise.resolve([]),
    includeGps ? reportRoadAllocations(imeis, contexts.map(job => job.jobId), from, to) : Promise.resolve([])
  ]);
  const manualByJob = new Map(contextManuals.map(manual => [manual.jobId, manual]));
  for (const source of sources) if (source.manual) manualByJob.set(source.job.jobId, source.manual);
  const visitedInRange = new Set(ownVisits.filter(visit => inRange(visit.proofTo || visit.entryAt || visit.firstInsideAt)).map(visit => visit.association.jobId));
  const chargedJobs = contexts.filter(job => finishedJobIds.has(job.jobId) && (visitedInRange.has(job.jobId) || rowByJob.has(job.jobId)));
  const chargeReports = (includeGps ? chargedJobs : []).map(job => {
    const input = { job, visits: visitsByJob.get(job.jobId) ?? [], coverage, manual: manualByJob.get(job.jobId) ?? null };
    const initial = assessRoadCharges(input);
    const conflicts = initial.obligations.map(row => mergeRoadAllocation(allocations, row).conflict).filter((flag): flag is NonNullable<typeof flag> => !!flag);
    return assessRoadCharges({ ...input, allocationConflicts: conflicts });
  });
  const chargeRows = chargeReports.flatMap(report => report.obligations).filter(row => inRange(row.occurredAt));
  const pointsByJob = new Map<string, typeof gps.positions>();
  for (const point of gps.positions) {
    const association = associate(point);
    if (!association.jobId || association.driverInitials !== initials) continue;
    const group = pointsByJob.get(association.jobId) ?? [];
    group.push(point); pointsByJob.set(association.jobId, group);
  }
  const drivesByJob = new Map<string, typeof gps.drives>();
  for (const drive of gps.drives) {
    const first = associate({ imei: drive.imei, occurredAt: drive.start, timeSource: "provider-assumed-utc" });
    const last = associate({ imei: drive.imei, occurredAt: new Date(Date.parse(drive.end) - 1).toISOString(), timeSource: "provider-assumed-utc" });
    if (!first.jobId || first.jobId !== last.jobId || first.driverInitials !== initials || last.driverInitials !== initials) continue;
    const group = drivesByJob.get(first.jobId) ?? [];
    group.push(drive); drivesByJob.set(first.jobId, group);
  }
  const movement = (includeGps ? rows : []).map(row => {
    const job = sourceByJob.get(row.jobId)!;
    const ownedPoints = pointsByJob.get(job.jobId) ?? [], drives = drivesByJob.get(job.jobId) ?? [];
    const onJob = gpsMovement(ownedPoints, drives, job.actualStart, job.actualFinish);
    const approach = job.onMyWayAt && job.actualStart ? gpsMovement(ownedPoints, drives, job.onMyWayAt, job.actualStart) : null;
    return { jobId: job.jobId, onJob, approach };
  });
  const auditByRef = new Map(liabilityData.audits.map(row => [row.sourceRef, row]));
  const liabilities = liabilityData.sources.flatMap(source => {
    if (source.driverSnapshot ? source.driverSnapshot.initials !== initials : profile?.email && source.driver !== profile.email && !rows.some(row => row.jobId === source.jobId)) return [];
    const job = liabilityData.jobs.find(job => job.jobId === source.jobId);
    if (!job || job.status !== "COMPLETED") return [];
    const record = buildLiabilityRecord(source, job);
    if (!record) return [];
    const prior = auditByRef.get(record.sourceRef);
    const effective = prior && prior.sourceHash !== record.sourceHash ? { ...prior, issues: [...prior.issues, "Source differs from saved audit snapshot; review required."] } : record;
    return inRange(effective.date) ? [effective] : [];
  });
  const projectedRefs = new Set(liabilities.map(row => row.sourceRef));
  for (const audit of liabilityData.audits) if (liabilityData.jobs.some(job => job.jobId === audit.jobId && job.status === "COMPLETED") && !projectedRefs.has(audit.sourceRef) && inRange(audit.date) &&
    (audit.driver.initials ? audit.driver.initials === initials : audit.driver.actor === profile?.email || rows.some(row => row.jobId === audit.jobId))) {
    liabilities.push({ ...audit, issues: [...audit.issues, "Original source/job is unavailable or changed; saved audit evidence is retained for review."] });
  }
  const liabilityContexts = liabilityData.jobs.filter(job => liabilities.some(row => row.jobId === job.jobId));
  const completedMovement = movement.filter(entry => rowByJob.get(entry.jobId)?.status === "COMPLETED");
  const movingKnownSeconds = completedMovement.reduce((sum, entry) => sum + (entry.onJob.movingSeconds ?? 0), 0);
  const trends = reportTrends(rows, groupBy).map(trend => {
    const matches = completedMovement.filter(entry => {
      const row = rowByJob.get(entry.jobId);
      return row?.operationalDate && reportPeriod(row.operationalDate, groupBy) === trend.period;
    });
    return { ...trend, movingKnownSeconds: matches.reduce((sum, entry) => sum + (entry.onJob.movingSeconds ?? 0), 0),
      movingUnknownJobs: matches.filter(entry => entry.onJob.movingSeconds === null).length, movingPartialJobs: matches.filter(entry => entry.onJob.coverage === "partial").length };
  });
  const movementByJob = new Map(movement.map(entry => [entry.jobId, entry]));
  const chargesByJob = new Map(chargeReports.map(report => [report.jobId, report]));
  const alertsByJob = new Map<string, typeof roadAlerts>();
  for (const alert of roadAlerts) if (alert.jobId) {
    const group = alertsByJob.get(alert.jobId) ?? []; group.push(alert); alertsByJob.set(alert.jobId, group);
  }
  return { version: "driver-report-v1", generatedAt: now, driver: { initials, name: profile?.fullName || rows[0]?.identity.name || initials, email: profile?.email || null,
      hasCurrentAccount: !!profile, currentVehicleImei: profile?.imei || null }, range, groupBy,
    dateBasis: { jobs: "recorded-operational-start-else-booking", events: "occurrence", liabilities: "approved-incident-else-labelled-submission", endExclusive: true, timezone: "Europe/London" },
    summary: { ...summarizeReportJobs(rows), expectedRoadChargeTotals: summarizeExpectedRoadCharges(roadAlerts, new Set(rows.map(row => row.jobId)), includeGps), movingKnownSeconds, movingUnknownJobs: includeGps ? completedMovement.filter(entry => entry.onJob.movingSeconds === null).length : rows.filter(row => row.status === "COMPLETED").length,
      movingPartialJobs: completedMovement.filter(entry => entry.onJob.coverage === "partial").length },
    trends, jobs: rows.map(row => ({ ...row, movement: movementByJob.get(row.jobId), roadCharges: chargesByJob.get(row.jobId),
      roadAlerts: alertsByJob.get(row.jobId) ?? [], alertHistoryTruncated: alertHistory.truncated })),
    events, visits: visitRows, charges: chargeRows, roadAlerts, alertHistoryTruncated: alertHistory.truncated, liabilities,
    liabilitySummary: { ...summarizeLiabilities(liabilities), ...(includeLiabilities ? {} : { completeTotalPence: null }) },
    contextJobs: [...new Map([...contexts, ...liabilityContexts].map(job => [job.jobId, job])).values()].filter(job => !rows.some(row => row.jobId === job.jobId) && (events.some(event => event.association.jobId === job.jobId) || visitRows.some(visit => visit.association.jobId === job.jobId) || chargeRows.some(charge => charge.jobId === job.jobId) || liabilities.some(row => row.jobId === job.jobId)))
      .map(job => ({ jobId: job.jobId, includedInFinancialTotals: false, jobDetailsUrl: `/admin?section=jobs&job=${encodeURIComponent(job.jobId)}` })),
    gpsSummary: { coverage: includeGps ? coverage : "not-requested", providerCoverage: "unknown", truncated: gps.truncated, portalIssue, observedEventCount: events.length, congestionEntries: visitRows.filter(row => row.scheme === "congestion" && row.entryObserved).length,
      confirmedTunnelCrossings: coverage === "unavailable" ? null : visitRows.filter(row => row.physicalCrossingConfirmed).length, inferredVisits: visitRows.filter(row => !row.entryObserved).length,
      chargeVerificationCounts: chargeReports.flatMap(report => report.flags).reduce((counts, flag) => ({ ...counts, [flag.code]: (counts[flag.code] ?? 0) + 1 }), {} as Record<string, number>),
      observedChargeKnownPence: chargeRows.reduce((total, row) => total + (row.expectedPence ?? 0), 0), unknownChargeAmounts: chargeRows.filter(row => row.expectedPence === null).length },
    meta: { financialTotalsCoverAllMatchingJobs: true, providerCompletenessKnown: false, readConsistency: "nontransactional", monetaryLiabilityIntakeEnabled: false, adminManualEditingEnabled: false, liabilitiesIncluded: includeLiabilities, gpsIncluded: includeGps,
      cachePolicy: "bounded-display-cache-invalidated-on-app-writes", roadActivityScope: "job-linked-only", gpsContextHours: 6, collectionScope: "completed-operational-range-jobs", gpsCountsAreObservedMinimum: true } };
}
