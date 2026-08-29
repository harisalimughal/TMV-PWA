import { google, sheets_v4 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { DriverProfile } from "../jobs/job.types";
import { withRetry } from "../utils/retry";

/**
 * Read-only access to the Drivers and Settings tabs -- the two things still
 * Sheets-backed in tmv-pwa. Driver PROFILES (initials, phone, van registration, role,
 * active flag) are an admin-managed roster, edited via TMV-Chat-bot's Add/Edit Driver
 * flow, which is unchanged and stays on Sheets. Settings (email templates, crew rates)
 * are the SAME Settings tab TMV-Chat-bot's admin dashboard already edits (see its
 * dashboard/server/routes/settings.route.ts) -- reading it here means ops's existing
 * "Job Completion Email" / "Customer Review Request Email" fields on that dashboard
 * take effect for tmv-pwa too, with no new admin UI needed. Everything else this file
 * used to hold (jobs, evidence, activity, payments, signatures) moved to MongoDB --
 * see db/jobs.repo.ts, db/evidence.repo.ts, db/activity.repo.ts -- and Drive-based
 * photo storage moved to Cloudinary (storage/cloudinary.ts). The full read/write
 * version this was trimmed from is TMV-Chat-bot's google/sheets.ts, if any of that
 * ever needs restoring here.
 */

export const SHEETS = {
  DRIVERS: "Drivers",
  SETTINGS: "Settings"
} as const;

const SCHEMA: Record<string, string[]> = {
  [SHEETS.DRIVERS]: ["Initials", "Full Name", "Email", "Chat User Name", "Active", "Role", "Phone", "Van Registration"],
  [SHEETS.SETTINGS]: ["Key", "Value", "Notes"]
};

let clientPromise: Promise<sheets_v4.Sheets> | null = null;

async function client(): Promise<sheets_v4.Sheets> {
  if (!clientPromise) {
    clientPromise = createGoogleAuth(SCOPES.SHEETS)
      .then(auth => google.sheets({ version: "v4", auth }))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/**
 * Bounded to the schema width. `A:ZZ` requested 702 columns for an 8-column sheet;
 * Sheets trims to the populated range but the request and response are still wider
 * than they need to be, and the bound documents the contract.
 */
const fullRange = (sheetName: string) => {
  const width = SCHEMA[sheetName]?.length ?? 26;
  return `${quoteSheet(sheetName)}!A:${columnLetter(width - 1)}`;
};

// ---------------------------------------------------------------------------
// Value cache. Keyed by A1 range.
// ---------------------------------------------------------------------------

interface CachedValues {
  at: number;
  values: string[][];
}

const valueCache = new Map<string, CachedValues>();

async function readRanges(ranges: string[], ttlMs: number): Promise<string[][][]> {
  const now = Date.now();
  const missing = ranges.filter(range => {
    const hit = valueCache.get(range);
    if (!hit) return true;
    if (now - hit.at < 5000) return false;
    if (ttlMs <= 0) return true;
    return now - hit.at >= ttlMs;
  });

  if (missing.length) {
    const sheets = await client();
    const response = await withRetry("sheets.values.batchGet", () =>
      sheets.spreadsheets.values.batchGet({ spreadsheetId: env.spreadsheetId, ranges: missing })
    );
    const returned = response.data.valueRanges ?? [];
    missing.forEach((range, index) => {
      valueCache.set(range, { at: Date.now(), values: (returned[index]?.values ?? []) as string[][] });
    });
  }

  return ranges.map(range => valueCache.get(range)?.values ?? []);
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const headers = rows[0] ?? [];
  return rows
    .slice(1)
    .filter(row => row.some(value => String(value ?? "").trim() !== ""))
    .map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = String(row[index] ?? "");
      });
      return obj;
    });
}

async function listObjects(sheetName: string, ttlMs = env.driverCacheTtlMs): Promise<Record<string, string>[]> {
  const [rows] = await readRanges([fullRange(sheetName)], ttlMs);
  return rowsToObjects(rows);
}

function rowToDriverProfile(row: Record<string, string>): DriverProfile {
  function boolFromSheet(value: string): boolean {
    const normalized = value.trim().toUpperCase();
    return normalized === "" || normalized === "TRUE" || normalized === "YES" || normalized === "1";
  }
  return {
    initials: (row["Initials"] ?? "").trim(),
    fullName: (row["Full Name"] ?? "").trim(),
    email: (row["Email"] ?? "").trim(),
    chatUserName: (row["Chat User Name"] ?? "").trim(),
    active: boolFromSheet(row["Active"] || "TRUE"),
    role: (row["Role"] ?? "").trim() || "Driver",
    phone: (row["Phone"] ?? "").trim(),
    vanRegistration: (row["Van Registration"] ?? "").trim()
  };
}

export async function getDriver(identifier: string): Promise<DriverProfile | null> {
  const rows = await listObjects(SHEETS.DRIVERS);
  const normalized = identifier.trim().toLowerCase();
  const row = rows.find(
    r =>
      (r["Email"] ?? "").trim().toLowerCase() === normalized ||
      (r["Chat User Name"] ?? "").trim().toLowerCase() === normalized
  );
  return row ? rowToDriverProfile(row) : null;
}

export async function getDriverByInitials(initials: string): Promise<DriverProfile | null> {
  const rows = await listObjects(SHEETS.DRIVERS);
  const normalized = initials.trim().toUpperCase();
  const row = rows.find(r => (r["Initials"] ?? "").trim().toUpperCase() === normalized);
  return row ? rowToDriverProfile(row) : null;
}

/** Admin-editable operational text/values -- same Settings tab and same keys
 * TMV-Chat-bot's dashboard reads/writes. Falls back to the caller-supplied default
 * until ops sets a row for that key, so a blank Settings tab never breaks anything. */
export async function getSetting(key: string, fallback: string): Promise<string> {
  const rows = await listObjects(SHEETS.SETTINGS, env.driverCacheTtlMs);
  const row = rows.find(r => (r["Key"] ?? "").trim() === key);
  const value = row?.["Value"]?.trim();
  return value || fallback;
}
