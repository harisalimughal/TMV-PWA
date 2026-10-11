import { DateTime } from "luxon";
import { gpsId } from "./gps.parse";

/** A reviewable proposal only: no provider calls, database connection, writes or automatic execution. */
export function planGpsBackfill(imeis: string[], from: string, to: string, now = new Date()) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(from) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(to)) throw new RangeError("Backfill timestamps require explicit offsets.");
  const start = DateTime.fromISO(from, { setZone: true }), end = DateTime.fromISO(to, { setZone: true });
  if (!start.isValid || !end.isValid || end <= start || end.diff(start, "days").days > 31 || end.toMillis() > now.getTime()) throw new RangeError("Backfill range must be positive, past-only and at most 31 days.");
  const devices = [...new Set(imeis)].sort();
  if (!devices.length || devices.length > 10 || devices.some(imei => !/^\d{1,30}$/.test(imei))) throw new RangeError("Choose 1-10 valid tracker IMEIs.");
  const windows: Array<{ id: string; imei: string; from: string; to: string; requestBudget: number }> = [];
  for (const imei of devices) for (let at = start.toMillis(); at < end.toMillis(); at += 6 * 3600000) {
    if (windows.length >= 128) throw new RangeError("More than 128 backfill windows; narrow the range or choose fewer trackers.");
    const a = DateTime.fromMillis(at).toUTC().toISO()!, b = DateTime.fromMillis(Math.min(at + 6 * 3600000, end.toMillis())).toUTC().toISO()!;
    windows.push({ id: gpsId(["gps-sync-v1", imei, a, b]), imei, from: a, to: b, requestBudget: 18 });
  }
  return { version: "gps-backfill-plan-v1", dryRun: true, executesImport: false, generatedAt: now.toISOString(), windows, budgetScope: "fresh-history-slice-requests-only",
    minimumProviderRequests: windows.length * 3, maximumProviderRequests: windows.length * 18,
    notes: ["Request counts cover fresh history slices only, exclude cached zone/metadata lookups, and may be lower on checkpoint resume.",
      "Provider retention and completeness are unknown; ask for available history and quota approval before execution.",
      "Use the existing protected sync API only in an approved test/live environment. Each run has durable checkpoints and stable source IDs.",
      "Resume partial/failed runs before expanding the range. Saturated/invalid sources stay partial. Never synthesize old crossings from first-entry flags.",
      "This plan does not allocate charges, reprice completed jobs, edit manual details or update tracker assignments."] };
}
