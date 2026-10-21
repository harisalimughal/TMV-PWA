import { getDb } from "../db/mongo";
import type { Filter } from "mongodb";
import type { GpsDrive, GpsEvent, GpsPosition, GpsSyncRun } from "./gps.types";

const events = async () => (await getDb()).collection<GpsEvent>("gps_events");
const positions = async () => (await getDb()).collection<GpsPosition>("gps_positions");
const drives = async () => (await getDb()).collection<GpsDrive>("gps_drives");
const runs = async () => (await getDb()).collection<GpsSyncRun>("gps_sync_runs");

export async function ensureGpsIndexes(): Promise<void> {
  const [e, p, d, r] = await Promise.all([events(), positions(), drives(), runs()]);
  await Promise.all([e.createIndex({ imei: 1, occurredAt: 1 }), e.createIndex({ receivedAt: 1 }),
    e.createIndex({ occurredAt: 1 }),
    p.createIndex({ imei: 1, occurredAt: 1 }), d.createIndex({ imei: 1, start: 1 }), r.createIndex({ imei: 1, from: 1, to: 1 })]);
  const jobs = (await getDb()).collection("jobs");
  await Promise.all([jobs.createIndex({ gpsliveImei: 1 }), jobs.createIndex({ "gpsDeviceHistory.imei": 1 })]);
}

const literal = (value: unknown) => ({ $literal: value });
function eventUpdate(event: GpsEvent) {
  const set: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(event)) {
    if (["sources", "deliveries", "lastReceivedAt", "conflicts"].includes(field)) continue;
    set[field] = { $ifNull: ["$" + field, literal(value)] };
  }
  set.timeSource = { $cond: [{ $eq: [{ $ifNull: ["$occurredAt", null] }, null] }, literal(event.timeSource), "$timeSource"] };
  set.rawTime = { $cond: [{ $eq: [{ $ifNull: ["$occurredAt", null] }, null] }, literal(event.rawTime), "$rawTime"] };
  for (const field of ["zoneName", "deviceName"] as const) set[field] = { $cond: [
    { $eq: [{ $ifNull: ["$" + field, ""] }, ""] }, literal(event[field]), "$" + field
  ] };
  set.sources = { $setUnion: [{ $ifNull: ["$sources", []] }, literal(event.sources)] };
  set.deliveries = { $add: [{ $ifNull: ["$deliveries", 0] }, 1] };
  set.lastReceivedAt = literal(event.lastReceivedAt);
  set.conflicts = { $setUnion: [{ $ifNull: ["$conflicts", []] }, ...["imei", "occurredAt", "type", "scheme"].map(field => ({
    $cond: [{ $and: [
      { $ne: [{ $ifNull: ["$" + field, null] }, null] },
      { $ne: [literal((event as any)[field]), null] },
      { $ne: ["$" + field, literal((event as any)[field])] }
    ] }, [field], []]
  }))] };
  return [{ $set: set }];
}

export async function saveGpsEvent(event: GpsEvent): Promise<GpsEvent> {
  const col = await events();
  try { await col.updateOne({ _id: event._id }, eventUpdate(event), { upsert: true }); }
  catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await col.updateOne({ _id: event._id }, eventUpdate(event));
  }
  return (await col.findOne({ _id: event._id }))!;
}

export async function saveGpsEvents(rows: GpsEvent[]): Promise<void> {
  if (!rows.length) return;
  const col = await events();
  const operations = rows.map(event => ({ updateOne: { filter: { _id: event._id }, update: eventUpdate(event), upsert: true } }));
  try { await col.bulkWrite(operations, { ordered: true }); }
  catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    await col.bulkWrite(operations, { ordered: true });
  }
}

export async function saveGpsPositions(rows: GpsPosition[]): Promise<void> {
  if (!rows.length) return;
  const col = await positions();
  await col.bulkWrite(rows.map(row => {
    const set: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(row)) if (field !== "sources") set[field] = { $ifNull: ["$" + field, literal(value)] };
    set.sources = { $setUnion: [{ $ifNull: ["$sources", []] }, literal(row.sources)] };
    set.conflicting = { $or: [{ $ifNull: ["$conflicting", false] }, { $and: [
      { $ne: [{ $ifNull: ["$lat", null] }, null] }, { $or: [{ $ne: ["$lat", row.lat] }, { $ne: ["$lng", row.lng] }] }
    ] }] };
    return { updateOne: { filter: { _id: row._id }, update: [{ $set: set }], upsert: true } };
  }), { ordered: true });
}

export async function saveGpsDrives(rows: GpsDrive[]): Promise<void> {
  if (rows.length) await (await drives()).bulkWrite(rows.map(row => ({ updateOne: {
    filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true } })), { ordered: true });
}

export async function saveGpsRun(run: GpsSyncRun): Promise<void> {
  await (await runs()).replaceOne({ _id: run._id }, run, { upsert: true });
}
export async function getGpsRun(id: string): Promise<GpsSyncRun | null> { return (await runs()).findOne({ _id: id }); }
export async function latestGpsRun(imei: string): Promise<GpsSyncRun | null> { return (await runs()).findOne({ imei }, { sort: { startedAt: -1 } }); }

export async function gpsEventsPage(from: string, to: string, imei: string | undefined, page: number, pageSize: number) {
  const filter: Filter<GpsEvent> = { ...(imei ? { imei } : {}), $or: [
    { occurredAt: { $gte: from, $lt: to } }, { timeSource: { $in: ["missing", "invalid", "future"] }, receivedAt: { $gte: from, $lt: to } }
  ] };
  const col = await events();
  return { items: await col.find(filter).sort({ occurredAt: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), total: await col.countDocuments(filter) };
}

export async function readGpsEventRange(imeis: string[], from: string, to: string) {
  const rows = await (await events()).find({ imei: { $in: imeis }, occurredAt: { $gte: from, $lte: to } }).sort({ occurredAt: 1 }).limit(20_001).toArray();
  return { events: rows.slice(0, 20_000), truncated: rows.length > 20_000 };
}

export async function readGpsRange(imeis: string[], from: string, to: string, options: { forReport?: boolean } = {}) {
  const [e, p, d, r] = await Promise.all([events(), positions(), drives(), runs()]);
  const imei = { $in: imeis };
  const cap = 20_000;
  const pointQuery = p.find({ imei, occurredAt: { $gte: from, $lte: to } });
  const runFilter = { imei, from: { $lt: to }, to: { $gt: from } };
  const runQuery = r.find(runFilter);
  if (options.forReport) {
    pointQuery.project({ _id: 1, imei: 1, occurredAt: 1, timeSource: 1, lat: 1, lng: 1, speedKph: 1,
      ignitionOn: 1, conflicting: 1, sources: 1, receivedAt: 1 });
    runQuery.project({ zoneSnapshot: 0, intervals: 0 });
  }
  const [eventRows, pointRows, driveRows, runRows, snapshots] = await Promise.all([
    e.find({ imei, occurredAt: { $gte: from, $lte: to } }).sort({ occurredAt: 1 }).limit(cap + 1).toArray(),
    pointQuery.sort({ occurredAt: 1 }).limit(cap + 1).toArray(),
    d.find({ imei, start: { $lt: to }, end: { $gt: from } }).sort({ start: 1 }).limit(cap + 1).toArray(),
    runQuery.sort({ startedAt: -1 }).limit(100).toArray(),
    // Preserve the same newest usable geometry within the existing 100-run coverage window.
    options.forReport ? r.aggregate<Pick<GpsSyncRun, "_id" | "zoneSnapshot">>([
      { $match: runFilter }, { $sort: { startedAt: -1 } }, { $limit: 100 },
      { $match: { "zoneSnapshot.0": { $exists: true } } }, { $limit: 1 }, { $project: { zoneSnapshot: 1 } }
    ]).toArray() : Promise.resolve([])
  ]);
  if (options.forReport) for (const run of runRows) run.zoneSnapshot = run._id === snapshots[0]?._id ? snapshots[0].zoneSnapshot : [];
  return { events: eventRows.slice(0, cap), positions: pointRows.slice(0, cap), drives: driveRows.slice(0, cap), runs: runRows,
    truncated: eventRows.length > cap || pointRows.length > cap || driveRows.length > cap || runRows.length === 100 };
}

export async function readGpsMovementRange(imeis: string[], from: string, to: string, windows?: Array<{ from: string; to: string }>) {
  const db = await getDb(), cap = 20_000, imei = { $in: imeis };
  // The report only attributes movement inside these job intervals. Retain a
  // two-minute boundary buffer, matching the largest accepted GPS sample gap.
  const pointWindows = windows?.map(window => ({ occurredAt: { $gte: new Date(Date.parse(window.from) - 120000).toISOString(), $lte: new Date(Date.parse(window.to) + 120000).toISOString() } }));
  const driveWindows = windows?.map(window => ({ start: { $lt: window.to }, end: { $gt: window.from } }));
  const [pointRows, driveRows] = await Promise.all([
    db.collection<GpsPosition>("gps_positions").find({ imei, occurredAt: { $gte: from, $lte: to }, ...(pointWindows?.length ? { $or: pointWindows } : {}) })
      .project<GpsPosition>({ _id: 1, imei: 1, occurredAt: 1, timeSource: 1, conflicts: 1, conflicting: 1, lat: 1, lng: 1, speedKph: 1, ignitionOn: 1 }).sort({ occurredAt: 1 }).limit(cap + 1).toArray(),
    db.collection<GpsDrive>("gps_drives").find({ imei, start: { $lt: to }, end: { $gt: from }, ...(driveWindows?.length ? { $or: driveWindows } : {}) }).sort({ start: 1 }).limit(cap + 1).toArray()
  ]);
  return { positions: pointRows.slice(0, cap), drives: driveRows.slice(0, cap), truncated: pointRows.length > cap || driveRows.length > cap };
}
