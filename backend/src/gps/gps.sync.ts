import { DateTime } from "luxon";
import { fetchGpsLiveZones } from "../integrations/gpslive";
import { withLock } from "../utils/lock";
import { gpsId, parseGpsDrive, parseGpsEvent, parseGpsPosition } from "./gps.parse";
import { getGpsRun, saveGpsDrives, saveGpsEvents, saveGpsPositions, saveGpsRun } from "./gps.repo";
import { fetchGpsHistorySlice } from "./gps.provider";
import type { GpsQueryInterval, GpsSyncRun } from "./gps.types";
import { reportFeatureEnabled } from "../reports/release-controls";

export function gpsRange(from: unknown, to: unknown, maxDays = 7): { from: string; to: string } {
  if (typeof from !== "string" || typeof to !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(from) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(to)) throw new RangeError("GPS range requires explicit timezone offsets.");
  const a = DateTime.fromISO(from, { setZone: true }), b = DateTime.fromISO(to, { setZone: true });
  if (!a.isValid || !b.isValid || b <= a || b.diff(a, "days").days > maxDays) throw new RangeError(`GPS range must be positive and at most ${maxDays} days.`);
  return { from: a.toUTC().toISO()!, to: b.toUTC().toISO()! };
}

export async function syncGpsHistory(imei: string, from: string, to: string, budget = 128): Promise<GpsSyncRun> {
  if (!reportFeatureEnabled("gpsHistory")) throw new Error("GPS history imports are paused; saved checkpoints are unchanged.");
  if (!/^\d{1,30}$/.test(imei)) throw new RangeError("A valid tracker IMEI is required.");
  const range = gpsRange(from, to);
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 128) throw new RangeError("GPS request budget must be between 1 and 128.");
  if (Date.parse(range.to) > Date.now() + 60_000) throw new RangeError("GPS import cannot query future history.");
  return withLock(`gps-history:${imei}`, async () => {
    const id = gpsId(["gps-sync-v1", imei, range.from, range.to]);
    const previous = await getGpsRun(id);
    const run: GpsSyncRun = { _id: id, imei, ...range, startedAt: new Date().toISOString(), finishedAt: null,
      status: "running", providerCoverage: "unknown", requests: 0,
      intervals: previous && previous.status !== "queried" ? previous.intervals.filter(row => row.status === "queried") : [], zoneSnapshot: previous?.zoneSnapshot ?? [] };
    await saveGpsRun(run);
    if (!run.zoneSnapshot.length) {
      try { run.zoneSnapshot = await fetchGpsLiveZones(); } catch { /* Visits remain unverifiable without shapes. */ }
    }
    const query = async (source: GpsQueryInterval["source"], a: number, b: number): Promise<void> => {
      const window = { source, from: new Date(a).toISOString(), to: new Date(b).toISOString() };
      if (run.intervals.some(row => row.source === source && row.from === window.from && row.to === window.to && row.status === "queried")) return;
      if (run.requests >= budget) {
        run.intervals.push({ ...window, status: "partial", rows: 0, reason: "Request budget reached; retry resumes completed slices." });
        return;
      }
      run.requests++;
      try {
        const body = await fetchGpsHistorySlice(source, imei, window.from, window.to);
        const trip = source === "trips" && body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
        const rows = source === "trips" ? trip?.routes : body;
        if (!Array.isArray(rows) || (source === "trips" && (!Array.isArray(trip?.drives) || (trip?.events !== undefined && !Array.isArray(trip.events))))) throw new Error("Unexpected provider history shape.");
        const limit = source === "alerts" ? 500 : 5000;
        const saturated = rows.length >= limit || (Array.isArray(trip?.drives) && trip.drives.length >= limit) || (Array.isArray(trip?.events) && trip.events.length >= limit);
        if (saturated && b - a > 60_000 && run.requests < budget) {
          const mid = Math.floor((a + b) / 2000) * 1000;
          await query(source, a, mid); await query(source, mid, b); return;
        }
        const receivedAt = new Date().toISOString();
        let rejected = 0;
        if (source === "alerts") {
          const events = rows.slice(0, limit).map(row => parseGpsEvent(row, "alerts-history", receivedAt, imei));
          rejected = events.filter(row => !row || !row.occurredAt || row.timeSource === "future").length;
          await saveGpsEvents(events.filter((row): row is NonNullable<typeof row> => !!row));
        } else {
          const points = rows.slice(0, limit).map(row => parseGpsPosition(row, imei, source === "trips" ? "trip-history" : "positions-history", receivedAt));
          rejected = points.filter(row => !row).length;
          await saveGpsPositions(points.filter((row): row is NonNullable<typeof row> => !!row));
          if (trip) {
            const drives = (trip.drives as unknown[]).slice(0, limit).map(row => parseGpsDrive(row, imei, receivedAt));
            rejected += drives.filter(row => !row).length;
            await saveGpsDrives(drives.filter((row): row is NonNullable<typeof row> => !!row));
            const events = (Array.isArray(trip.events) ? trip.events : []).slice(0, limit).map(row => parseGpsEvent(row, "trip-history", receivedAt, imei));
            rejected += events.filter(row => !row || !row.occurredAt || row.timeSource === "future").length;
            await saveGpsEvents(events.filter((row): row is NonNullable<typeof row> => !!row));
          }
        }
        run.intervals.push({ ...window, rows: rows.length, status: saturated || rejected ? "partial" : "queried",
          reason: saturated ? "Saturated provider slice; completeness cannot be established." : rejected ? "Invalid/future history rows prevent complete usable coverage." : null });
      } catch (error) {
        run.intervals.push({ ...window, status: "failed", rows: 0, reason: error instanceof Error ? error.message : "History query failed." });
      }
      await saveGpsRun(run);
    };
    const end = Date.parse(range.to);
    for (let a = Date.parse(range.from); a < end; a += 6 * 3_600_000) {
      for (const source of ["alerts", "positions", "trips"] as const) await query(source, a, Math.min(end, a + 6 * 3_600_000));
    }
    run.finishedAt = new Date().toISOString();
    run.status = run.intervals.some(row => row.status !== "queried") ? "partial" : "queried";
    await saveGpsRun(run);
    return run;
  });
}
