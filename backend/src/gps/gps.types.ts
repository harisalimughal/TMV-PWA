export type GpsScheme = "congestion" | "dartford" | "blackwall-silvertown";
export type GpsSource = "webhook" | "alerts-history" | "trip-history" | "positions-history";
export type GpsTimeSource = "explicit-offset" | "provider-assumed-utc" | "missing" | "invalid" | "future";

export interface GpsEvent {
  _id: string;
  providerEventId: string | null;
  identity: "provider-id" | "fingerprint";
  imei: string | null;
  deviceName: string;
  type: "entry" | "exit";
  scheme: GpsScheme | null;
  zoneId: string | null;
  zoneName: string;
  occurredAt: string | null;
  rawTime: string | null;
  timeSource: GpsTimeSource;
  location: { lat: number; lng: number } | null;
  raw: Record<string, unknown>;
  sources: GpsSource[];
  receivedAt: string;
  lastReceivedAt: string;
  deliveries: number;
  conflicts?: string[];
}

export interface GpsPosition {
  _id: string;
  imei: string;
  occurredAt: string;
  timeSource: GpsTimeSource;
  lat: number;
  lng: number;
  speedKph: number | null;
  ignitionOn?: boolean | null;
  sources: GpsSource[];
  receivedAt: string;
  conflicting?: boolean;
}

export interface GpsDrive {
  _id: string;
  imei: string;
  start: string;
  end: string;
  movingSeconds: number | null;
}

export interface GpsDeviceAssignment {
  imei: string;
  from: string;
  to: string | null;
  driverInitials: string;
  source: "profile-snapshot" | "job-start-resolution" | "pickup-report" | "legacy-pin";
}

export interface GpsAssociation {
  jobId: string | null;
  driverInitials: string | null;
  phase: "approach" | "on-job" | null;
  confidence: "recorded-assignment" | "legacy-pin" | "unmatched" | "ambiguous";
  candidateJobIds: string[];
  reason: string | null;
}

export interface GpsVisit {
  id: string;
  imei: string;
  scheme: GpsScheme;
  entryAt: string | null;
  firstInsideAt: string;
  exitAt: string | null;
  durationSeconds: number | null;
  entryObserved: boolean;
  origin: "alerts" | "positions";
  status: "observed-pair" | "open" | "inferred";
  physicalCrossingConfirmed: boolean;
  eventIds: string[];
  zoneNames: string[];
  issues: string[];
  association: GpsAssociation;
  tunnelName?: string;
  direction?: string;
  proofPositionIds?: string[];
  proofFrom?: string;
  proofTo?: string;
  portalProofKind?: "continuous-route" | "bounded-signal-gap";
}

export interface GpsTunnelPortalRule {
  id: string;
  scheme: Exclude<GpsScheme, "congestion">;
  tunnelName: string;
  effectiveFrom: string;
  sideA: [number, number][];
  sideB: [number, number][];
}

export interface GpsQueryInterval {
  source: "alerts" | "positions" | "trips";
  from: string;
  to: string;
  status: "queried" | "partial" | "failed";
  rows: number;
  reason: string | null;
}

export interface GpsSyncRun {
  _id: string;
  imei: string;
  from: string;
  to: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "queried" | "partial";
  providerCoverage: "unknown";
  intervals: GpsQueryInterval[];
  requests: number;
  zoneSnapshot: Array<{ zoneId: number; zoneName: string; zoneVertices: [number, number][] }>;
}
