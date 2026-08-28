import { google, sheets_v4 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import {
  DriverProfile, EvidenceProgress, EvidenceRecord, EvidenceStatus, EvidenceType, Job
} from "../jobs/job.types";
import { withRetry } from "../utils/retry";
import { log } from "../utils/logger";

export const SHEETS = {
  DASHBOARD: "Dashboard",
  BOOKINGS: "Bookings",
  DRIVER_FLOW: "DriverFlow",
  PHOTOS: "Photos",
  SIGNATURES: "Signatures",
  PAYMENTS: "Payments",
  DRIVERS: "Drivers",
  CUSTOMERS: "Customers",
  ACTIVITY: "ActivityLog",
  WORKFLOW: "WorkflowState",
  SETTINGS: "Settings",
  REPORTS: "Reports",
  EXCEPTIONS: "ExceptionReport",
  ANALYTICS: "Analytics",
  PROCESSED_EVENTS: "ProcessedEvents",
  EVIDENCE: "Evidence",
  STORAGE_CHECK_IN: "StorageCheckIn",
  STORAGE_CHECK_OUT: "StorageCheckOut",
  PARKING_LIABILITY: "ParkingLiability",
  LIABILITY_REPORT: "LiabilityReport",
  PENDING_SIGNATURES: "PendingSignatures",
  SCENARIO_PROGRESS: "ScenarioProgress",
  DRIVER_SPACES: "DriverSpaces"
} as const;

const BOOKING_HEADERS = [
  "Job ID", "Calendar Event ID", "Driver Initials", "Customer", "Customer Email", "Phone", "Pickup", "Dropoff",
  "Crew Size", "Base Price", "Paid Online", "Booked Start", "Booked Finish", "Actual Start", "Actual Finish",
  "Booked Minutes", "Actual Minutes", "Difference Minutes", "Delay Status", "Extra Charges", "Overtime Minutes",
  "Overtime Charge", "Total Charges", "Payment Method", "Payment Status", "Client Name/Postcode", "Client Confirmed By",
  "Status", "Current State", "Drive Folder ID", "Drive Folder URL", "Created", "Updated"
];

/**
 * Evidence is the durable record of an accepted-but-not-yet-stored photo. It is written
 * synchronously on the Chat request (status RECEIVED) and completed by the background
 * worker, so it is the handoff point between the fast path and the queue.
 */
const EVIDENCE_HEADERS = [
  "Evidence ID", "Job ID", "Driver", "Evidence Type", "Attachment Ref", "Content Type", "File Name",
  "Status", "Received", "Processing Started", "Processing Completed", "Drive File ID", "Drive URL",
  "Retry Count", "Last Error"
];

export const SCHEMA: Record<string, string[]> = {
  [SHEETS.DASHBOARD]: ["Metric", "Value"],
  [SHEETS.BOOKINGS]: BOOKING_HEADERS,
  [SHEETS.DRIVER_FLOW]: ["Timestamp", "Job ID", "Driver", "Field", "Value", "State"],
  [SHEETS.PHOTOS]: ["Timestamp", "Job ID", "Driver", "Step", "File ID", "File URL", "File Name", "Content Type"],
  [SHEETS.SIGNATURES]: ["Timestamp", "Job ID", "Driver", "Customer Name", "Mode", "Confirmation Text"],
  [SHEETS.PAYMENTS]: ["Timestamp", "Job ID", "Driver", "Method", "Amount", "Status"],
  [SHEETS.DRIVERS]: ["Initials", "Full Name", "Email", "Chat User Name", "Active", "Role", "Phone", "Van Registration"],
  [SHEETS.CUSTOMERS]: ["Customer ID", "Name", "Email", "Phone", "Address", "Updated"],
  [SHEETS.ACTIVITY]: ["Timestamp", "Job ID", "Driver", "Action", "From State", "To State", "Detail"],
  [SHEETS.WORKFLOW]: ["Job ID", "Driver", "State", "Updated"],
  [SHEETS.SETTINGS]: ["Key", "Value", "Notes"],
  [SHEETS.PROCESSED_EVENTS]: ["Event Key", "Job ID", "Outcome State", "Processed At"],
  [SHEETS.REPORTS]: ["Generated", "Report", "Value"],
  [SHEETS.EXCEPTIONS]: ["Timestamp", "Job ID", "Type", "Detail", "Resolved"],
  [SHEETS.ANALYTICS]: ["Date", "Metric", "Value"],
  [SHEETS.EVIDENCE]: EVIDENCE_HEADERS,
  [SHEETS.STORAGE_CHECK_IN]: [
    "Timestamp", "Job ID", "Driver", "Container Number", "Client Name", "Client Phone", "Client Email",
    "Client Present", "Date", "Photo URLs", "Signature URL"
  ],
  [SHEETS.STORAGE_CHECK_OUT]: [
    "Timestamp", "Job ID", "Driver", "Container Number", "Client Name", "Client Email",
    "Client Present At Dropoff", "Date", "Photo URLs", "Signature URL"
  ],
  [SHEETS.PARKING_LIABILITY]: [
    "Timestamp", "Job ID", "Driver", "Address", "Client Full Name", "Photo URLs", "Signature URL"
  ],
  [SHEETS.LIABILITY_REPORT]: [
    "Timestamp", "Job ID", "Driver", "Damage Categories", "Photo URLs", "Signature URL"
  ],
  // Remembers which Chat message is currently showing the "waiting on the customer to
  // sign" card for a job, so the signature POST handler (running on the customer's
  // device, outside the normal Chat request/response cycle) can push that same card
  // forward to the next step once they've signed — see google/chat.ts's updateChatCard().
  [SHEETS.PENDING_SIGNATURES]: ["Job ID", "Message Name", "Updated"],
  // One row per (job, scenario) currently being filled in via Chat cards — see
  // chat/scenario.engine.ts. "Key" is "<jobId>::<scenario>", the upsert key, since a
  // driver could in principle be partway through more than one scenario on the same job.
  [SHEETS.SCENARIO_PROGRESS]: ["Key", "Job ID", "Scenario", "Step", "Fields JSON", "Message Name", "Started", "Updated"],
  [SHEETS.DRIVER_SPACES]: ["Driver Initials", "Space Name", "Updated"]
};

// ---------------------------------------------------------------------------
// Client (single instance, reusing the cached auth client)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Metadata caches (sheet ids, headers) — structure does not change at runtime
// ---------------------------------------------------------------------------

interface SheetMeta {
  sheetId: number;
  columnCount: number;
}

let metaCache: Map<string, SheetMeta> | null = null;

async function loadMeta(force = false): Promise<Map<string, SheetMeta>> {
  if (metaCache && !force) return metaCache;
  const sheets = await client();
  const response = await withRetry("sheets.get.meta", () =>
    sheets.spreadsheets.get({
      spreadsheetId: env.spreadsheetId,
      fields: "sheets.properties(sheetId,title,gridProperties(columnCount))"
    })
  );
  const map = new Map<string, SheetMeta>();
  for (const sheet of response.data.sheets ?? []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (!title || sheetId == null) continue;
    map.set(title, { sheetId, columnCount: sheet.properties?.gridProperties?.columnCount ?? 26 });
  }
  metaCache = map;
  return map;
}

async function sheetMeta(name: string): Promise<SheetMeta> {
  let meta = (await loadMeta()).get(name);
  if (!meta) meta = (await loadMeta(true)).get(name);
  if (!meta) throw new Error(`Sheet tab "${name}" does not exist in the spreadsheet.`);
  return meta;
}

const headerCache = new Map<string, string[]>();

async function headersFor(sheetName: string): Promise<string[]> {
  const cached = headerCache.get(sheetName);
  if (cached) return cached;

  // Known tabs resolve from SCHEMA with no API call. ensureDatabaseStructure()
  // reads the live header rows at startup and overwrites this cache when the
  // spreadsheet disagrees, so the request path never pays for a header read.
  const fromSchema = SCHEMA[sheetName];
  if (fromSchema) {
    headerCache.set(sheetName, fromSchema);
    return fromSchema;
  }

  const [values] = await readRanges([`${quoteSheet(sheetName)}!1:1`], 0);
  const headers = (values[0] ?? []).map(String).filter(h => h.trim() !== "");
  if (!headers.length) throw new Error(`No schema for sheet ${sheetName}`);
  headerCache.set(sheetName, headers);
  return headers;
}

// ---------------------------------------------------------------------------
// Value cache. Keyed by A1 range; invalidated on write to the owning tab.
// ---------------------------------------------------------------------------

interface CachedValues {
  at: number;
  values: string[][];
}

const valueCache = new Map<string, CachedValues>();

function rangeSheetName(range: string): string {
  const match = range.match(/^'((?:[^']|'')+)'!/);
  return match ? match[1].replace(/''/g, "'") : range.split("!")[0];
}

function invalidateSheet(sheetName: string): void {
  for (const key of [...valueCache.keys()]) {
    if (rangeSheetName(key) === sheetName) valueCache.delete(key);
  }
}

async function readRanges(ranges: string[], ttlMs: number): Promise<string[][][]> {
  const now = Date.now();
  const missing = ranges.filter(range => {
    const hit = valueCache.get(range);
    if (!hit) return true;
    // If the cache was updated locally in the last 5 seconds, trust it
    // to avoid eventual-consistency lag from the Google Sheets API replica.
    if (now - hit.at < 5000) return false;
    // ttlMs === 0 means "always refetch". `now - hit.at > 0` was false whenever the
    // cached read landed in the same millisecond, so a deliberate cache-bypassing read
    // — the one the job lock relies on to make the double-tap guard exclusive — could
    // silently be served stale.
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

/**
 * Bounded to the schema width. `A:ZZ` requested 702 columns for a 33-column sheet;
 * Sheets trims to the populated range but the request and response are still wider
 * than they need to be, and the bound documents the contract.
 */
const fullRange = (sheetName: string) => {
  const width = SCHEMA[sheetName]?.length ?? 26;
  return `${quoteSheet(sheetName)}!A:${columnLetter(width - 1)}`;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

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

export async function listObjects(sheetName: string, ttlMs = env.sheetCacheTtlMs): Promise<Record<string, string>[]> {
  const [rows] = await readRanges([fullRange(sheetName)], ttlMs);
  return rowsToObjects(rows);
}

/**
 * Admin-editable operational text (currently just the Start Job workflow's customer
 * confirmation/signature paragraph — see admin/admin.routes.ts). Falls back to the
 * caller-supplied default until an admin sets a Settings row for the key, so a blank
 * spreadsheet never breaks the driver-facing card.
 */
export async function getSetting(key: string, fallback: string, ttlMs = env.driverCacheTtlMs): Promise<string> {
  const row = await findObject(SHEETS.SETTINGS, "Key", key, ttlMs);
  const value = row?.["Value"]?.trim();
  return value || fallback;
}

export function getSettingSync(key: string, fallback: string): string {
  const cached = valueCache.get(fullRange(SHEETS.SETTINGS));
  if (!cached) return fallback;
  const objects = rowsToObjects(cached.values);
  const row = objects.find(o => o["Key"] === key);
  return row?.["Value"]?.trim() || fallback;
}

export function settingWrite(key: string, value: string, notes = ""): SheetWrite {
  return { sheet: SHEETS.SETTINGS, key: { column: "Key", value: key }, data: { "Key": key, "Value": value, "Notes": notes } };
}

export function pendingSignatureWrite(jobId: string, messageName: string): SheetWrite {
  return {
    sheet: SHEETS.PENDING_SIGNATURES,
    key: { column: "Job ID", value: jobId },
    data: { "Job ID": jobId, "Message Name": messageName, "Updated": new Date().toISOString() }
  };
}

/** Always fresh — a stale message name would push the update into the wrong card. */
export async function getPendingSignatureMessage(jobId: string): Promise<string> {
  const row = await findObject(SHEETS.PENDING_SIGNATURES, "Job ID", jobId, 0);
  return row?.["Message Name"]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Scenario progress — the Chat-card-driven Check In/Check Out/Parking Liability/
// Liability Report steppers (see chat/scenario.engine.ts). One row per (job, scenario).
// ---------------------------------------------------------------------------

export interface ScenarioProgressRecord {
  jobId: string;
  scenario: string;
  /** A field index ("0", "1", ...) or a sentinel: "notice:<fieldIndex>" | "photos" | "signature". */
  step: string;
  fields: Record<string, string>;
  /** The Chat message currently showing this scenario's card, for the same
   *  proactive-push pattern the classic flow's signature step uses. */
  messageName: string;
  /**
   * When THIS attempt began (set once by initScenario, carried through unchanged by
   * every other step-advancing write). Used to scope "how many photos have been
   * received" to the current attempt only — without it, a driver redoing an
   * already-submitted scenario on the same job would inherit the previous attempt's
   * photo count (same Job ID + evidence type), showing photos as already received
   * before they'd sent anything this time.
   */
  startedAt: string;
  updatedAt: string;
}

function scenarioProgressKey(jobId: string, scenario: string): string {
  return `${jobId}::${scenario}`;
}

function rowToScenarioProgress(row: Record<string, string>): ScenarioProgressRecord {
  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse(row["Fields JSON"] || "{}");
  } catch {
    fields = {};
  }
  return {
    jobId: row["Job ID"] ?? "",
    scenario: row["Scenario"] ?? "",
    step: row["Step"] ?? "",
    fields,
    messageName: row["Message Name"] ?? "",
    startedAt: row["Started"] ?? "",
    updatedAt: row["Updated"] ?? ""
  };
}

export function scenarioProgressWrite(record: {
  jobId: string; scenario: string; step: string; fields: Record<string, string>; messageName: string; startedAt: string;
}): SheetWrite {
  const key = scenarioProgressKey(record.jobId, record.scenario);
  return {
    sheet: SHEETS.SCENARIO_PROGRESS,
    key: { column: "Key", value: key },
    data: {
      "Key": key,
      "Job ID": record.jobId,
      "Scenario": record.scenario,
      "Step": record.step,
      "Fields JSON": JSON.stringify(record.fields),
      "Message Name": record.messageName,
      "Started": record.startedAt,
      "Updated": new Date().toISOString()
    }
  };
}

export async function getScenarioProgress(
  jobId: string, scenario: string, ttlMs = 0
): Promise<ScenarioProgressRecord | null> {
  const row = await findObject(SHEETS.SCENARIO_PROGRESS, "Key", scenarioProgressKey(jobId, scenario), ttlMs);
  return row ? rowToScenarioProgress(row) : null;
}

/**
 * Every scenario currently in progress for a job (any scenario), most recently
 * updated first — used to route a bare Chat-attached photo to whichever scenario is
 * actually waiting on one, since a MESSAGE event carries no scenario of its own.
 */
export async function listScenarioProgressForJob(jobId: string, ttlMs = 0): Promise<ScenarioProgressRecord[]> {
  const rows = await listObjects(SHEETS.SCENARIO_PROGRESS, ttlMs);
  return rows
    .filter(r => r["Job ID"] === jobId)
    .map(rowToScenarioProgress)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findObject(
  sheetName: string,
  keyColumn: string,
  keyValue: string,
  ttlMs?: number
): Promise<Record<string, string> | null> {
  const objects = await listObjects(sheetName, ttlMs);
  return objects.find(o => o[keyColumn] === keyValue) ?? null;
}

interface ColumnSlice {
  range: string;
  offsets: number[];
}

/**
 * Describes a contiguous column slice. Used for the append-only log tabs, which
 * grow without bound and must never be pulled in full.
 */
async function columnSlice(sheetName: string, wanted: string[]): Promise<ColumnSlice> {
  const headers = await headersFor(sheetName);
  const indices = wanted.map(name => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`Column ${name} not found in ${sheetName}`);
    return index;
  });
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  return {
    range: `${quoteSheet(sheetName)}!${columnLetter(first)}2:${columnLetter(last)}`,
    offsets: indices.map(index => index - first)
  };
}

function sliceToObjects(rows: string[][], wanted: string[], slice: ColumnSlice): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    wanted.forEach((name, position) => {
      obj[name] = String(row[slice.offsets[position]] ?? "");
    });
    return obj;
  });
}

async function readColumns(sheetName: string, wanted: string[], ttlMs: number): Promise<Record<string, string>[]> {
  const slice = await columnSlice(sheetName, wanted);
  const [rows] = await readRanges([slice.range], ttlMs);
  return sliceToObjects(rows, wanted, slice);
}

// ---------------------------------------------------------------------------
// Writes — every logical save is one spreadsheets.batchUpdate call
// ---------------------------------------------------------------------------

export interface SheetWrite {
  sheet: string;
  data: Record<string, unknown>;
  /** When present the write is an upsert against this column; otherwise it appends. */
  key?: { column: string; value: string };
}

function toCell(value: unknown): sheets_v4.Schema$CellData {
  if (value == null || value === "") return { userEnteredValue: { stringValue: "" } };
  if (typeof value === "number" && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  if (Array.isArray(value)) return { userEnteredValue: { stringValue: value.join(" | ") } };
  return { userEnteredValue: { stringValue: String(value) } };
}

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) return value.join(" | ");
  return String(value);
}

/**
 * Locates 1-based row numbers for a set of (sheet, key column) pairs, reading only
 * those columns and fetching all of them in a single batchGet.
 */
async function keyRowMaps(
  pairs: { sheet: string; column: string }[],
  ttlMs: number
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (!pairs.length) return result;

  const ranges: string[] = [];
  for (const pair of pairs) {
    const headers = await headersFor(pair.sheet);
    const index = headers.indexOf(pair.column);
    if (index < 0) throw new Error(`Column ${pair.column} not found in ${pair.sheet}`);
    const letter = columnLetter(index);
    ranges.push(`${quoteSheet(pair.sheet)}!${letter}2:${letter}`);
  }

  const allRows = await readRanges(ranges, ttlMs);
  pairs.forEach((pair, index) => {
    const map = new Map<string, number>();
    allRows[index].forEach((row, offset) => {
      const value = String(row[0] ?? "");
      if (value && !map.has(value)) map.set(value, offset + 2);
    });
    result.set(`${pair.sheet}::${pair.column}`, map);
  });
  return result;
}

/**
 * All Sheets writes funnel through here and are serialised in-process.
 *
 * upsertObject previously read the whole tab, computed a row index, then issued a
 * separate update — so a concurrent append between the two could redirect the write
 * onto the wrong job's row. The mutex closes that window within an instance; a
 * cross-instance guarantee needs real transactions (Tier 2).
 */
let writeChain: Promise<unknown> = Promise.resolve();

function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

export async function commitWrites(writes: SheetWrite[]): Promise<void> {
  if (!writes.length) return;

  return serialise(async () => {
    const requests: sheets_v4.Schema$Request[] = [];
    const appended = new Set<string>();
    let hasAppend = false;

    // Row lookups for every keyed write, resolved in one batched read.
    // ttl 0: a stale row number would send the write to the wrong job's row.
    const pairs = [...new Set(writes.filter(w => w.key).map(w => `${w.sheet}::${w.key!.column}`))].map(composite => {
      const [sheet, column] = composite.split("::");
      return { sheet, column };
    });
    const rowMaps = await keyRowMaps(pairs, 0);

    for (const write of writes) {
      const headers = await headersFor(write.sheet);
      const meta = await sheetMeta(write.sheet);
      if (meta.columnCount < headers.length) {
        throw new Error(
          `Sheet "${write.sheet}" has ${meta.columnCount} columns but the schema needs ${headers.length}. ` +
            "Run ensureDatabaseStructure() to widen it."
        );
      }
      const rowNumber = write.key
        ? rowMaps.get(`${write.sheet}::${write.key.column}`)?.get(write.key.value)
        : undefined;

      if (write.key && rowNumber) {
        const missing = headers.filter(h => !(h in write.data));
        if (missing.length) {
          throw new Error(
            `Keyed write to "${write.sheet}" is missing columns: ${missing.join(", ")}. ` +
              "Keyed writes must supply the complete row so no existing value is blanked."
          );
        }
        requests.push({
          updateCells: {
            start: { sheetId: meta.sheetId, rowIndex: rowNumber - 1, columnIndex: 0 },
            rows: [{ values: headers.map(h => toCell(write.data[h])) }],
            fields: "userEnteredValue"
          }
        });
        patchCachedRow(write.sheet, rowNumber, headers, write.data);
      } else {
        hasAppend = true;
        appended.add(write.sheet);
        requests.push({
          appendCells: {
            sheetId: meta.sheetId,
            rows: [{ values: headers.map(h => toCell(write.data[h])) }],
            fields: "userEnteredValue"
          }
        });
      }
    }

    const sheets = await client();
    await withRetry(
      "sheets.batchUpdate",
      () => sheets.spreadsheets.batchUpdate({ spreadsheetId: env.spreadsheetId, requestBody: { requests } }),
      // A retried append could duplicate a row if the first attempt actually landed,
      // so appends only retry on 429 (rejected before being applied).
      hasAppend ? "rate-limit-only" : "idempotent"
    );

    // Only appended tabs gained rows. Updated rows are patched in place above, so
    // a tab that received only updates keeps its warm cache.
    for (const sheet of appended) invalidateSheet(sheet);

    log.debug("sheets write committed", { writes: writes.length, requests: requests.length, appended: hasAppend });
  });
}

/** Keeps the cached full-range view consistent after an in-place row update. */
function patchCachedRow(sheetName: string, rowNumber: number, headers: string[], data: Record<string, unknown>): void {
  const cached = valueCache.get(fullRange(sheetName));
  if (!cached) return;
  const rowIndex = rowNumber - 1;
  if (rowIndex >= cached.values.length) return;
  cached.values[rowIndex] = headers.map(h => displayValue(data[h]));
  cached.at = Date.now();
}

export async function appendObject(sheetName: string, data: Record<string, unknown>): Promise<void> {
  await commitWrites([{ sheet: sheetName, data }]);
}

export async function upsertObject(
  sheetName: string,
  keyColumn: string,
  keyValue: string,
  data: Record<string, unknown>
): Promise<void> {
  await commitWrites([{ sheet: sheetName, data, key: { column: keyColumn, value: keyValue } }]);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function ensureDatabaseStructure(): Promise<void> {
  const sheets = await client();
  let meta = await loadMeta(true);

  const missing = Object.keys(SCHEMA).filter(name => !meta.has(name));
  if (missing.length) {
    await withRetry("sheets.batchUpdate.addSheets", () =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.spreadsheetId,
        requestBody: {
          requests: missing.map(title => ({
            addSheet: {
              properties: {
                title,
                // appendCells/updateCells do not auto-expand the grid the way the
                // values API does, so the tab must be created wide enough up front.
                gridProperties: { rowCount: 1000, columnCount: Math.max(26, SCHEMA[title].length) }
              }
            }
          }))
        }
      })
    );
    meta = await loadMeta(true);
    log.info("created missing sheet tabs", { tabs: missing });
  }

  // Widen any pre-existing tab that is narrower than its schema.
  const widen: sheets_v4.Schema$Request[] = [];
  for (const [name, headers] of Object.entries(SCHEMA)) {
    const current = meta.get(name);
    if (current && current.columnCount < headers.length) {
      widen.push({
        appendDimension: {
          sheetId: current.sheetId,
          dimension: "COLUMNS",
          length: headers.length - current.columnCount
        }
      });
    }
  }
  if (widen.length) {
    await withRetry("sheets.batchUpdate.widen", () =>
      sheets.spreadsheets.batchUpdate({ spreadsheetId: env.spreadsheetId, requestBody: { requests: widen } })
    );
    meta = await loadMeta(true);
    log.info("widened narrow sheet tabs", { count: widen.length });
  }

  // One batched read of every header row, then one batched write of the missing ones.
  const names = Object.keys(SCHEMA);
  const headerRows = await readRanges(names.map(name => `${quoteSheet(name)}!1:1`), 0);
  const headerWrites: sheets_v4.Schema$ValueRange[] = [];
  names.forEach((name, index) => {
    const existing = headerRows[index]?.[0] ?? [];
    if (existing.length === 0) {
      headerWrites.push({ range: `${quoteSheet(name)}!A1`, values: [SCHEMA[name]] });
    } else {
      headerCache.set(name, existing.map(String).filter(h => h.trim() !== ""));
    }
  });

  if (headerWrites.length) {
    await withRetry("sheets.values.batchUpdate.headers", () =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: env.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data: headerWrites }
      })
    );
    for (const write of headerWrites) {
      const name = rangeSheetName(write.range!);
      headerCache.set(name, SCHEMA[name]);
      invalidateSheet(name);
    }
    log.info("wrote missing header rows", { count: headerWrites.length });
  }
}

// ---------------------------------------------------------------------------
// Domain mapping (unchanged)
// ---------------------------------------------------------------------------

function boolFromSheet(value: string): boolean {
  return ["TRUE", "true", "1", "yes", "Y"].includes(value);
}

/**
 * Sheets' default read mode returns a cell's FORMATTED display string, not its raw
 * value — a numeric cell that ever picked up currency formatting (e.g. someone
 * manually formatting it in the Sheets UI) reads back as "£141.00", not "141". Strip
 * the formatting chars before parsing, the same way fromPounds()/validateCurrency()
 * already do for driver-typed amounts, so a formatted cell doesn't silently become 0.
 */
function num(value: string): number {
  const cleaned = String(value ?? "").replace(/[£$,\s]/g, "");
  const parsed = Number(cleaned || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function bookingRowToJob(row: Record<string, string>): Job {
  return {
    jobId: row["Job ID"],
    calendarEventId: row["Calendar Event ID"],
    driverInitials: row["Driver Initials"],
    customerName: row["Customer"],
    customerEmail: row["Customer Email"],
    customerPhone: row["Phone"],
    pickup: row["Pickup"],
    dropoff: row["Dropoff"],
    crewSize: num(row["Crew Size"]),
    basePrice: num(row["Base Price"]),
    paidOnline: boolFromSheet(row["Paid Online"]),
    bookedStart: row["Booked Start"],
    bookedFinish: row["Booked Finish"],
    actualStart: row["Actual Start"],
    actualFinish: row["Actual Finish"],
    bookedMinutes: num(row["Booked Minutes"]),
    actualMinutes: num(row["Actual Minutes"]),
    differenceMinutes: num(row["Difference Minutes"]),
    delayStatus: row["Delay Status"],
    extraCharges: row["Extra Charges"] ? row["Extra Charges"].split(" | ").filter(Boolean) : [],
    overtimeMinutes: num(row["Overtime Minutes"]),
    overtimeCharge: num(row["Overtime Charge"]),
    totalCharges: num(row["Total Charges"]),
    paymentMethod: row["Payment Method"],
    paymentStatus: row["Payment Status"],
    clientNamePostcode: row["Client Name/Postcode"],
    clientConfirmedBy: row["Client Confirmed By"],
    driveFolderId: row["Drive Folder ID"],
    driveFolderUrl: row["Drive Folder URL"],
    status: (row["Status"] || "READY") as Job["status"],
    currentState: row["Current State"] || "READY",
    createdAt: row["Created"],
    updatedAt: row["Updated"]
  };
}

export function jobToBookingRow(job: Job): Record<string, unknown> {
  return {
    "Job ID": job.jobId,
    "Calendar Event ID": job.calendarEventId,
    "Driver Initials": job.driverInitials,
    "Customer": job.customerName,
    "Customer Email": job.customerEmail,
    "Phone": job.customerPhone,
    "Pickup": job.pickup,
    "Dropoff": job.dropoff,
    "Crew Size": job.crewSize,
    "Base Price": job.basePrice,
    "Paid Online": job.paidOnline,
    "Booked Start": job.bookedStart,
    "Booked Finish": job.bookedFinish,
    "Actual Start": job.actualStart,
    "Actual Finish": job.actualFinish,
    "Booked Minutes": job.bookedMinutes,
    "Actual Minutes": job.actualMinutes,
    "Difference Minutes": job.differenceMinutes,
    "Delay Status": job.delayStatus,
    "Extra Charges": job.extraCharges,
    "Overtime Minutes": job.overtimeMinutes,
    "Overtime Charge": job.overtimeCharge,
    "Total Charges": job.totalCharges,
    "Payment Method": job.paymentMethod,
    "Payment Status": job.paymentStatus,
    "Client Name/Postcode": job.clientNamePostcode,
    "Client Confirmed By": job.clientConfirmedBy,
    "Status": job.status,
    "Current State": job.currentState,
    "Drive Folder ID": job.driveFolderId,
    "Drive Folder URL": job.driveFolderUrl,
    "Created": job.createdAt,
    "Updated": job.updatedAt
  };
}

// ---------------------------------------------------------------------------
// Write builders — compose these into a single commitWrites() call
// ---------------------------------------------------------------------------

export function jobWrite(job: Job): SheetWrite {
  return { sheet: SHEETS.BOOKINGS, data: jobToBookingRow(job), key: { column: "Job ID", value: job.jobId } };
}

/**
 * Keyed on Email since that's the primary identifier getDriver() matches Chat users
 * against — a resubmit with the same email updates the existing row instead of
 * duplicating it.
 */
export function driverWrite(data: {
  initials: string; fullName: string; email: string; chatUserName?: string; active: boolean; role?: string;
  phone?: string; vanRegistration?: string;
}): SheetWrite {
  return {
    sheet: SHEETS.DRIVERS,
    key: { column: "Email", value: data.email },
    data: {
      "Initials": data.initials,
      "Full Name": data.fullName,
      "Email": data.email,
      "Chat User Name": data.chatUserName ?? "",
      "Active": data.active,
      "Role": data.role ?? "Driver",
      "Phone": data.phone ?? "",
      "Van Registration": data.vanRegistration ?? ""
    }
  };
}

export function workflowWrite(jobId: string, driver: string, state: string): SheetWrite {
  return {
    sheet: SHEETS.WORKFLOW,
    key: { column: "Job ID", value: jobId },
    data: { "Job ID": jobId, "Driver": driver, "State": state, "Updated": new Date().toISOString() }
  };
}

export function activityWrite(data: {
  jobId: string; driver: string; action: string; fromState?: string; toState?: string; detail?: string;
}): SheetWrite {
  return {
    sheet: SHEETS.ACTIVITY,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Action": data.action,
      "From State": data.fromState ?? "",
      "To State": data.toState ?? "",
      "Detail": data.detail ?? ""
    }
  };
}

export function driverFlowWrite(data: {
  jobId: string; driver: string; field: string; value: string; state: string;
}): SheetWrite {
  return {
    sheet: SHEETS.DRIVER_FLOW,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Field": data.field,
      "Value": data.value,
      "State": data.state
    }
  };
}

export function photoWrite(data: {
  jobId: string; driver: string; step: string; fileId: string; fileUrl: string; fileName: string; contentType: string;
}): SheetWrite {
  return {
    sheet: SHEETS.PHOTOS,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Step": data.step,
      "File ID": data.fileId,
      "File URL": data.fileUrl,
      "File Name": data.fileName,
      "Content Type": data.contentType
    }
  };
}

export function signatureWrite(data: {
  jobId: string; driver: string; customerName: string; confirmationText: string; mode?: string;
}): SheetWrite {
  return {
    sheet: SHEETS.SIGNATURES,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Customer Name": data.customerName,
      "Mode": data.mode ?? "Typed confirmation in Google Chat",
      "Confirmation Text": data.confirmationText
    }
  };
}

export function paymentWrite(data: {
  jobId: string; driver: string; method: string; amount: number; status: string;
}): SheetWrite {
  return {
    sheet: SHEETS.PAYMENTS,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Method": data.method,
      "Amount": data.amount,
      "Status": data.status
    }
  };
}

/**
 * Replay lookup over the three narrow columns only.
 *
 * ProcessedEvents is append-only and grows a few rows per job forever, and it is read
 * on every photo and every card click. A full-tab read here would reintroduce exactly
 * the unbounded-growth problem the evidence tabs were moved off.
 */
export function storageCheckInWrite(data: {
  jobId: string; driver: string; containerNumber: string; clientName: string; clientPhone: string;
  clientEmail: string; clientPresent: string; date: string; photoUrls: string[]; signatureUrl: string;
}): SheetWrite {
  return {
    sheet: SHEETS.STORAGE_CHECK_IN,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Container Number": data.containerNumber,
      "Client Name": data.clientName,
      "Client Phone": data.clientPhone,
      "Client Email": data.clientEmail,
      "Client Present": data.clientPresent,
      "Date": data.date,
      "Photo URLs": data.photoUrls,
      "Signature URL": data.signatureUrl
    }
  };
}

export function storageCheckOutWrite(data: {
  jobId: string; driver: string; containerNumber: string; clientName: string;
  clientEmail: string; clientPresentAtDropoff: string; date: string; photoUrls: string[]; signatureUrl: string;
}): SheetWrite {
  return {
    sheet: SHEETS.STORAGE_CHECK_OUT,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Container Number": data.containerNumber,
      "Client Name": data.clientName,
      "Client Email": data.clientEmail,
      "Client Present At Dropoff": data.clientPresentAtDropoff,
      "Date": data.date,
      "Photo URLs": data.photoUrls,
      "Signature URL": data.signatureUrl
    }
  };
}

export function parkingLiabilityWrite(data: {
  jobId: string; driver: string; address: string; clientFullName: string; photoUrls: string[]; signatureUrl: string;
}): SheetWrite {
  return {
    sheet: SHEETS.PARKING_LIABILITY,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Address": data.address,
      "Client Full Name": data.clientFullName,
      "Photo URLs": data.photoUrls,
      "Signature URL": data.signatureUrl
    }
  };
}

export function liabilityReportWrite(data: {
  jobId: string; driver: string; damageCategories: string[]; photoUrls: string[]; signatureUrl: string;
}): SheetWrite {
  return {
    sheet: SHEETS.LIABILITY_REPORT,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Driver": data.driver,
      "Damage Categories": data.damageCategories,
      "Photo URLs": data.photoUrls,
      "Signature URL": data.signatureUrl
    }
  };
}

export async function findProcessedEvent(eventKey: string): Promise<Record<string, string> | null> {
  const rows = await readColumns(
    SHEETS.PROCESSED_EVENTS,
    ["Event Key", "Job ID", "Outcome State"],
    env.sheetCacheTtlMs
  );
  return rows.find(row => row["Event Key"] === eventKey) ?? null;
}

export function processedEventWrite(data: { eventKey: string; jobId: string; outcomeState: string }): SheetWrite {
  return {
    sheet: SHEETS.PROCESSED_EVENTS,
    data: {
      "Event Key": data.eventKey,
      "Job ID": data.jobId,
      "Outcome State": data.outcomeState,
      "Processed At": new Date().toISOString()
    }
  };
}

export function exceptionWrite(data: {
  jobId: string; type: string; detail: string;
}): SheetWrite {
  return {
    sheet: SHEETS.EXCEPTIONS,
    data: {
      "Timestamp": new Date().toISOString(),
      "Job ID": data.jobId,
      "Type": data.type,
      "Detail": data.detail,
      "Resolved": "FALSE"
    }
  };
}

// ---------------------------------------------------------------------------
// Domain reads
// ---------------------------------------------------------------------------

export async function upsertJob(job: Job): Promise<void> {
  await commitWrites([jobWrite(job)]);
}

export async function getJob(jobId: string, ttlMs?: number): Promise<Job | null> {
  const row = await findObject(SHEETS.BOOKINGS, "Job ID", jobId, ttlMs);
  return row ? bookingRowToJob(row) : null;
}

export async function listJobs(ttlMs?: number): Promise<Job[]> {
  return (await listObjects(SHEETS.BOOKINGS, ttlMs)).map(bookingRowToJob);
}

function rowToDriverProfile(row: Record<string, string>): DriverProfile {
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
  // The driver roster changes very rarely, so it gets a long TTL and normally
  // costs zero API calls on the request path.
  const rows = await listObjects(SHEETS.DRIVERS, env.driverCacheTtlMs);
  const normalized = identifier.trim().toLowerCase();
  const row = rows.find(
    r =>
      (r["Email"] ?? "").trim().toLowerCase() === normalized ||
      (r["Chat User Name"] ?? "").trim().toLowerCase() === normalized
  );
  return row ? rowToDriverProfile(row) : null;
}

/**
 * Used to validate a driver-initials tag (e.g. the admin panel's Add Job form) before
 * it's baked into a Calendar title. Job<->driver matching is by initials (see
 * jobs.service.ts's getNextJobForDriver), so a typo here silently makes a job invisible
 * to every driver rather than erroring — worth catching at creation time.
 */
export async function getDriverByInitials(initials: string): Promise<DriverProfile | null> {
  const rows = await listObjects(SHEETS.DRIVERS, env.driverCacheTtlMs);
  const normalized = initials.trim().toUpperCase();
  const row = rows.find(r => (r["Initials"] ?? "").trim().toUpperCase() === normalized);
  return row ? rowToDriverProfile(row) : null;
}

export async function upsertWorkflow(jobId: string, driver: string, state: string): Promise<void> {
  await commitWrites([workflowWrite(jobId, driver, state)]);
}

export async function appendActivity(data: {
  jobId: string; driver: string; action: string; fromState?: string; toState?: string; detail?: string;
}): Promise<void> {
  await commitWrites([activityWrite(data)]);
}

export async function appendDriverFlow(data: {
  jobId: string; driver: string; field: string; value: string; state: string;
}): Promise<void> {
  await commitWrites([driverFlowWrite(data)]);
}

export async function appendPhoto(data: {
  jobId: string; driver: string; step: string; fileId: string; fileUrl: string; fileName: string; contentType: string;
}): Promise<void> {
  await commitWrites([photoWrite(data)]);
}

export async function appendSignature(data: {
  jobId: string; driver: string; customerName: string; confirmationText: string;
}): Promise<void> {
  await commitWrites([signatureWrite(data)]);
}

export async function appendPayment(data: {
  jobId: string; driver: string; method: string; amount: number; status: string;
}): Promise<void> {
  await commitWrites([paymentWrite(data)]);
}

// ---------------------------------------------------------------------------
// Evidence records
// ---------------------------------------------------------------------------

function evidenceToRow(record: EvidenceRecord): Record<string, unknown> {
  return {
    "Evidence ID": record.evidenceId,
    "Job ID": record.jobId,
    "Driver": record.driverEmail,
    "Evidence Type": record.evidenceType,
    "Attachment Ref": record.attachmentReference,
    "Content Type": record.contentType,
    "File Name": record.fileName,
    "Status": record.status,
    "Received": record.receivedAt,
    "Processing Started": record.processingStartedAt,
    "Processing Completed": record.processingCompletedAt,
    "Drive File ID": record.driveFileId,
    "Drive URL": record.driveUrl,
    "Retry Count": record.retryCount,
    "Last Error": record.lastError
  };
}

function rowToEvidence(row: Record<string, string>): EvidenceRecord {
  return {
    evidenceId: row["Evidence ID"] ?? "",
    jobId: row["Job ID"] ?? "",
    driverEmail: row["Driver"] ?? "",
    evidenceType: (row["Evidence Type"] ?? "Arrival") as EvidenceType,
    attachmentReference: row["Attachment Ref"] ?? "",
    contentType: row["Content Type"] ?? "",
    fileName: row["File Name"] ?? "",
    status: (row["Status"] || EvidenceStatus.RECEIVED) as EvidenceStatus,
    receivedAt: row["Received"] ?? "",
    processingStartedAt: row["Processing Started"] ?? "",
    processingCompletedAt: row["Processing Completed"] ?? "",
    driveFileId: row["Drive File ID"] ?? "",
    driveUrl: row["Drive URL"] ?? "",
    retryCount: num(row["Retry Count"]),
    lastError: row["Last Error"] ?? ""
  };
}

/** Upsert builder. Compose into the same commitWrites() call as the workflow transition. */
export function evidenceWrite(record: EvidenceRecord): SheetWrite {
  return {
    sheet: SHEETS.EVIDENCE,
    data: evidenceToRow(record),
    key: { column: "Evidence ID", value: record.evidenceId }
  };
}

/** TTL 0 by default: a worker acting on a stale evidence row could re-upload a file. */
export async function getEvidence(evidenceId: string): Promise<EvidenceRecord | null> {
  const rows = await listObjects(SHEETS.EVIDENCE, 0);
  const row = rows.find(r => r["Evidence ID"] === evidenceId);
  return row ? rowToEvidence(row) : null;
}

export async function listEvidenceForJob(jobId: string, ttlMs = 0): Promise<EvidenceRecord[]> {
  const rows = await listObjects(SHEETS.EVIDENCE, ttlMs);
  return rows.filter(r => r["Job ID"] === jobId).map(rowToEvidence);
}

/**
 * Rows the reaper should re-drive: still RECEIVED or PROCESSING, and older than the
 * staleness threshold. Read fresh, always.
 */
export async function listStaleEvidence(olderThanMs: number): Promise<EvidenceRecord[]> {
  const rows = await listObjects(SHEETS.EVIDENCE, 0);
  const cutoff = Date.now() - olderThanMs;
  return rows
    .map(rowToEvidence)
    .filter(record => record.status === EvidenceStatus.RECEIVED || record.status === EvidenceStatus.PROCESSING)
    .filter(record => {
      const stamp = Date.parse(record.processingStartedAt || record.receivedAt);
      return Number.isFinite(stamp) ? stamp < cutoff : true;
    });
}

/**
 * Per-step evidence counts split by status, plus the signature flag, for the completion
 * gate. Reads two narrow column slices in one batchGet.
 *
 * Only COMPLETED counts as evidence. PENDING and FAILED are surfaced separately so the
 * driver gets "still processing" or "upload failed" rather than a generic block.
 */
export async function readEvidenceSummary(jobId: string): Promise<EvidenceProgress> {
  const evidenceWanted = ["Job ID", "Evidence Type", "Status"];
  const signatureWanted = ["Job ID"];
  const [evidenceSlice, signatureSlice] = await Promise.all([
    columnSlice(SHEETS.EVIDENCE, evidenceWanted),
    columnSlice(SHEETS.SIGNATURES, signatureWanted)
  ]);

  // ttl 0: the gate must never pass on a cached view that predates the worker's write.
  const [evidenceRaw, signatureRaw] = await readRanges([evidenceSlice.range, signatureSlice.range], 0);
  const evidenceRows = sliceToObjects(evidenceRaw, evidenceWanted, evidenceSlice);
  const signatureRows = sliceToObjects(signatureRaw, signatureWanted, signatureSlice);

  const completed: Record<string, number> = {};
  const pending: Record<string, number> = {};
  const failed: Record<string, number> = {};

  for (const row of evidenceRows) {
    if (row["Job ID"] !== jobId) continue;
    const type = row["Evidence Type"];
    const status = row["Status"];
    if (status === EvidenceStatus.COMPLETED) completed[type] = (completed[type] ?? 0) + 1;
    else if (status === EvidenceStatus.FAILED) failed[type] = (failed[type] ?? 0) + 1;
    else pending[type] = (pending[type] ?? 0) + 1;
  }

  return { completed, pending, failed, hasSignature: signatureRows.some(row => row["Job ID"] === jobId) };
}

// ---------------------------------------------------------------------------
// Driver Chat spaces — persists the DM space name per driver so the bot can
// proactively push messages (e.g. job assignment notifications).
// ---------------------------------------------------------------------------

export function driverSpaceWrite(driverInitials: string, spaceName: string): SheetWrite {
  return {
    sheet: SHEETS.DRIVER_SPACES,
    key: { column: "Driver Initials", value: driverInitials },
    data: {
      "Driver Initials": driverInitials,
      "Space Name": spaceName,
      "Updated": new Date().toISOString()
    }
  };
}

/** Returns the stored Chat space name for a driver, or empty string if not yet seen. */
export async function getDriverSpace(driverInitials: string): Promise<string> {
  const row = await findObject(SHEETS.DRIVER_SPACES, "Driver Initials", driverInitials, 0);
  return row?.["Space Name"]?.trim() ?? "";
}
