const switches = {
  reports: "TMV_DRIVER_REPORTS_ENABLED",
  exports: "TMV_DRIVER_REPORT_EXPORTS_ENABLED",
  gpsHistory: "TMV_GPS_HISTORY_SYNC_ENABLED",
} as const;

/** Operational pause switches only; never bypass locked manual details or reprice jobs. */
export function reportFeatureEnabled(feature: keyof typeof switches): boolean {
  const key = switches[feature], raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return true;
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  throw new Error(`${key} must be a boolean switch.`);
}
export function reportExportConcurrency(): number {
  const raw = process.env.TMV_DRIVER_REPORT_EXPORT_CONCURRENCY?.trim();
  if (!raw) return 1;
  if (raw === "1" || raw === "2") return Number(raw);
  throw new Error("TMV_DRIVER_REPORT_EXPORT_CONCURRENCY must be 1 or 2.");
}
