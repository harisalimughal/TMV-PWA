import { listObjects, SHEETS } from "../google/sheets";
import { env } from "../config/env";
import { sheetCache } from "./cache";
import { loadExcelDataset } from "./excel-loader";
import { ReadOptions, SheetDataset } from "./types";
import { log } from "../utils/logger";

const LATENCY_BUDGET_MS = 1000;

async function fetchFromLiveSheets(): Promise<SheetDataset> {
  const started = Date.now();

  try {
    const [
      bookings,
      drivers,
      workflow,
      driverFlow,
      payments,
      signatures,
      evidence,
      photos,
      activity,
      processedEvents,
      exceptions,
      settings,
      checkIn,
      checkOut,
      parking,
      liability,
      pendingSignatures,
      scenarioProgress
    ] = await Promise.all([
      listObjects(SHEETS.BOOKINGS),
      listObjects(SHEETS.DRIVERS),
      listObjects(SHEETS.WORKFLOW),
      listObjects(SHEETS.DRIVER_FLOW),
      listObjects(SHEETS.PAYMENTS),
      listObjects(SHEETS.SIGNATURES),
      listObjects(SHEETS.EVIDENCE),
      listObjects(SHEETS.PHOTOS),
      listObjects(SHEETS.ACTIVITY),
      listObjects(SHEETS.PROCESSED_EVENTS),
      listObjects(SHEETS.EXCEPTIONS),
      listObjects(SHEETS.SETTINGS),
      listObjects(SHEETS.STORAGE_CHECK_IN),
      listObjects(SHEETS.STORAGE_CHECK_OUT),
      listObjects(SHEETS.PARKING_LIABILITY),
      listObjects(SHEETS.LIABILITY_REPORT),
      listObjects(SHEETS.PENDING_SIGNATURES),
      listObjects(SHEETS.SCENARIO_PROGRESS)
    ]);

    const durationMs = Date.now() - started;
    if (durationMs > LATENCY_BUDGET_MS) {
      log.warn("dashboard live sheets read exceeded latency budget", {
        duration_ms: durationMs,
        budget_ms: LATENCY_BUDGET_MS
      });
    }

    return {
      bookings,
      drivers,
      workflow,
      driverFlow,
      payments,
      signatures,
      evidence,
      photos,
      activity,
      processedEvents,
      exceptions,
      settings,
      checkIn,
      checkOut,
      parking,
      liability,
      pendingSignatures,
      scenarioProgress,
      fetchedAt: new Date().toISOString(),
      durationMs,
      source: "live"
    };
  } catch (error) {
    // The local Excel snapshot is a dev convenience only (working offline / no
    // credentials) -- in production, a live-Sheets failure must surface as a real
    // error, not silently serve a static file that could be arbitrarily stale. This
    // is now the primary admin panel's data source, so wrong-looking-right numbers
    // here are a much bigger deal than they were as a secondary reporting view.
    if (env.nodeEnv === "production") throw error;

    log.warn("live sheets read failed; attempting local fallback dataset", { error: String(error) });
    const local = loadExcelDataset();
    if (local) {
      log.info("loaded dataset from local fallback workbook", {
        bookings_count: local.bookings.length,
        duration_ms: Date.now() - started
      });
      return local;
    }
    throw error;
  }
}

export async function readDataset(options: ReadOptions = {}): Promise<SheetDataset> {
  return sheetCache.getOrFetch(fetchFromLiveSheets, options.forceRefresh);
}
