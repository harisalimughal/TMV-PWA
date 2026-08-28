export interface SheetDataset {
  bookings: Record<string, string>[];
  drivers: Record<string, string>[];
  workflow: Record<string, string>[];
  driverFlow: Record<string, string>[];
  payments: Record<string, string>[];
  signatures: Record<string, string>[];
  evidence: Record<string, string>[];
  photos: Record<string, string>[];
  activity: Record<string, string>[];
  processedEvents: Record<string, string>[];
  exceptions: Record<string, string>[];
  settings: Record<string, string>[];
  checkIn: Record<string, string>[];
  checkOut: Record<string, string>[];
  parking: Record<string, string>[];
  liability: Record<string, string>[];
  pendingSignatures: Record<string, string>[];
  scenarioProgress: Record<string, string>[];
  fetchedAt: string;
  durationMs: number;
  /** "fallback" means this came from the local Excel snapshot, not live Sheets --
   *  see sheet-reader.ts. Surfaced so a caller can tell the data might be stale. */
  source: "live" | "fallback";
}

export interface ReadOptions {
  forceRefresh?: boolean;
}
