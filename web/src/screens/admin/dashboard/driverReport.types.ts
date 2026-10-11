export interface ReportPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ReportRoadAlert { id: string; type: "tunnel" | "congestion"; scheme: string; zone: string; enteredAt: string; exitedAt: string | null; durationSeconds: number | null; jobId: string | null; linkBasis: string; inChargeableHours: boolean | null; chargeable: boolean; estimatedPence: number | null; feeReason?: string | null; rateBasis: string; alerts: Array<{ id: string; type: string; description: string; occurredAt: string | null }> }
export interface ReportPayments { byMethod: Record<string, number>; knownCollectedPence: number; collectedPence: number | null; invoicePence: number; issues: string[] }
export interface ReportFlag { code: string; type: string; source: string; reason: string; evidenceIds: string[] }
export interface ReportManual { startTime: string; endTime: string; helperName: string; helperHours: number; amountCollectedPence: number; submittedAt: string; congestionCharge?: boolean; congestionChargePence?: number; paymentBreakdown?: Array<{ method: string; amountPence: number }>; chargeItems?: Array<{ type: string; name?: string; amountPence: number | null }> }
export interface ReportMovement { coverage: string; movingSeconds: number | null; stationarySeconds: number | null; idleSeconds: number | null; engineOffSeconds: number | null; unknownSeconds: number | null }
export interface DriverReportJob {
  timings?: { trackerArrivalAt: string | null; trackerArrivalDistanceMeters?: number | null; trackerUnverifiedReason?: string | null; proofPhotoAt: string | null; vanLoadedAt: string | null; emptyVanAt: string | null; customerSignedAt: string | null;
    proofPhotoSource?: "captured" | "recorded" | null; vanLoadedSource?: "captured" | "recorded" | null; emptyVanSource?: "captured" | "recorded" | null };
  roadAlerts?: ReportRoadAlert[];
  alertHistoryTruncated?: boolean;
  jobId: string; jobDetailsUrl: string; status: string; customer: { name: string; email?: string; phone?: string }; pickup: string; dropoff: string;
  bookedStart: string; bookedFinish: string; actualStart: string | null; actualFinish: string | null; operationalDate: string | null;
  firstEntryHints?: { congestionAt: string | null; tunnelAt: string | null; coverage: "first-entry-only-incomplete"; eligibleForAutomaticCharges: false } | null;
  duration: { bookedMinutes: number | null; allocatedMinutes: number | null; workingMinutes: number | null; manualMinutes: number | null; differenceMinutes: number | null; overtimeMinutes: number | null; arrivalDelayMinutes: number | null; arrivalSource: string };
  finance: { systemCalculatedPence: number | null; acceptedPence: number | null; expectedPence: number | null; adjustmentNote: string | null; systemPayments: ReportPayments; manualPayments: ReportPayments | null;
    separatePrepaymentPence: number; recognizedCollectionPence: number | null; signedDifferencePence: number | null; outstandingPence: number | null; excessCollectionPence: number | null;
    systemVsManualCollectionDifferencePence: number | null; paymentMethodDifferences: string[]; prepaymentsVerified: boolean; knownCollectionDifferencePence: number | null;
    basePence: number | null; congestionPence: number | null; tunnelPence: number | null; overtimePence: number | null };
  manualDetails: ReportManual | null; manualStatus: string; reviewSent: boolean; issues: string[];
  movement?: { onJob: ReportMovement; approach: ReportMovement | null };
  roadCharges?: { flags: ReportFlag[]; activity?: Array<{ visitId: string; type: string; occurredAt: string | null; chargeable: boolean | null; physicalConfirmed: boolean; eligible: boolean; reason: string }>; comparisons: Array<{ type: string; observedExpectedPence: number | null; jobRecordedPence: number | null; manualReportedPence: number | null }> };
}
export interface ReportVisit { id: string; imei: string; scheme: string; entryAt: string | null; firstInsideAt: string; exitAt: string | null; durationSeconds: number | null; entryObserved: boolean; physicalCrossingConfirmed: boolean; status: string; tunnelName?: string; direction?: string; zoneNames: string[]; issues: string[]; association: { jobId: string | null; driverInitials: string | null }; proofFrom?: string; proofTo?: string }
export interface ReportCharge { id: string; jobId: string; type: string; scheme: string; occurredAt: string; londonDate: string; expectedPence: number | null; authorityExpectedPence: null; tunnelName: string | null; direction: string | null; visitIds: string[]; authorityIssue: string }
export interface ReportLiability { id: string; jobId: string; jobDetailsUrl: string; type: string; classification: string; description: string; date: string | null; dateBasis: string; amountPence: number | null; responsibleParty: string; status: string; issues: string[]; photos: Array<{ url: string }>; signature: { url: string } | null; sourceRef: string }
export interface ReportSummary {
  expectedRoadChargeTotals?: Record<"tunnel" | "congestion", { pence: number | null; knownPence: number; unpricedEntries: number }>;
  manualRoadChargeTotals?: Record<"tunnel" | "congestion", { knownPence: number; knownJobs: number; missingJobs: number; unavailableJobs: number }>;
  roadChargeTotals?: { congestionPence: number | null; tunnelPence: number | null; congestionUnknownJobs: number; tunnelUnknownJobs: number };
  paymentCards?: { basis: string; totalChargesPence: number | null; totalChargeUnknownJobs: number;
    driverCollectionPence: number | null; driverCollectionUnknownJobs: number;
    manualEntriesPence: number | null; manualEntriesKnownPence?: number; manualEntryUnknownJobs: number; manualEntryMissingJobs?: number; outstandingPence: number | null;
    adjustmentReasons: Array<{ jobId: string; reason: string; calculatedPence: number | null; driverCollectionPence: number | null }>;
    jobFlowTotalPence: number | null; jobFlowTotalKnownPence: number; jobFlowUnknownJobs: number };
  assignedJobs: number; completedJobs: number; cancelledJobs: number; expectedKnownPence: number; expectedUnknownJobs: number; systemKnownCollectionsPence: number; unknownSystemCollectionJobs: number;
  recognizedKnownCollectionsPence: number; outstandingKnownPence: number; outstandingCompletePence: number | null; excessCollectionKnownPence: number; outstandingUnknownJobs: number; pendingManualJobs: number;
  systemPaymentsByMethodPence: Record<string, number>; workingMinutesKnown: number; workingMinutesUnknownJobs: number; manualMinutesKnown: number; manualMinutesUnknownJobs: number;
  overtimeChargesPence?: number | null; overtimeChargesUnknownJobs?: number; overtimeMinutesUnknownJobs?: number;
  overtimeMinutesKnown: number; arrivalDelayMinutesKnown: number; reviewSentJobs: number; reviewNotSentJobs: number; helperHoursKnown: number; helpers: Array<{ name: string; hours: number; jobs: number }>;
  discrepancies: number; movingKnownSeconds: number; movingUnknownJobs: number; movingPartialJobs: number;
}
export interface DriverReport {
  roadAlerts?: ReportPage<ReportRoadAlert>;
  roadAlertSummary?: { entries: number; chargeableEntries: number; estimatedKnownPence: number; unpricedEntries: number };
  alertHistoryTruncated?: boolean;
  version: string; generatedAt: string; driver: { initials: string; name: string; email: string | null; hasCurrentAccount: boolean; currentVehicleImei: string | null };
  range: { from: string; to: string }; summary: ReportSummary; trends: Array<ReportSummary & { period: string }>;
  jobs: ReportPage<DriverReportJob>; visits: ReportPage<ReportVisit>; events: ReportPage<{ _id: string; type: string; occurredAt: string | null; zoneName: string; scheme: string | null; location?: { lat: number; lng: number } | null; association: { jobId: string | null } }>;
  charges: ReportPage<ReportCharge>; liabilities: ReportPage<ReportLiability>;
  liabilitySummary: { records: number; knownTotalPence: number; completeTotalPence: number | null; unknownAmountCount: number; unverifiedEvidenceCount: number; knownUnresolvedPence: number; duplicateFinancialSourceCount: number; conflictingFinancialSourceCount: number };
  gpsSummary: { coverage: string; providerCoverage: string; truncated: boolean; portalIssue: string | null; observedEventCount: number; congestionEntries: number; confirmedTunnelCrossings: number | null; inferredVisits: number; observedChargeKnownPence: number; unknownChargeAmounts: number; chargeVerificationCounts: Record<string, number> };
  activitySummary?: { scheme: string; observedVisits: number; observedEntries: number; confirmedCrossings: number | null; chargeableObligations: number; knownCustomerPence: number; unknownChargeAmounts: number };
  contextJobs: Array<{ jobId: string; includedInFinancialTotals: false; jobDetailsUrl: string }>;
  meta: { financialTotalsCoverAllMatchingJobs: boolean; monetaryLiabilityIntakeEnabled: false; adminManualEditingEnabled: false; gpsIncluded?: boolean; liabilitiesIncluded?: boolean };
}
