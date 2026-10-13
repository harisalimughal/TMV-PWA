const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { DateTime } = require("luxon");

const ignition = row => row?.params?.acc === "1" || row?.params?.acc === 1 ? true : row?.params?.acc === "0" || row?.params?.acc === 0 ? false : null;
function profile(rows) {
  const sorted = [...rows].sort((a, b) => String(a.dtTracker ?? a.dt_tracker ?? a.timestamp).localeCompare(String(b.dtTracker ?? b.dt_tracker ?? b.timestamp)));
  let on = 0, off = 0, unknown = 0, switches = 0, last = null;
  const gaps = [];
  for (let index = 0; index < sorted.length; index++) {
    const state = ignition(sorted[index]);
    if (state === true) on++; else if (state === false) off++; else unknown++;
    if (state !== null && last !== null && state !== last) switches++;
    if (state !== null) last = state;
    if (index) {
      const time = row => DateTime.fromISO(String(row.dtTracker ?? row.dt_tracker ?? row.timestamp).replace(" ", "T"), { zone: "utc" }).toMillis();
      const gap = (time(sorted[index]) - time(sorted[index - 1])) / 1000;
      if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
    }
  }
  gaps.sort((a, b) => a - b);
  return { rows: rows.length, ignitionOn: on, ignitionOff: off, ignitionUnknown: unknown, ignitionTransitions: switches,
    medianGapSeconds: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, largestGapSeconds: gaps.length ? gaps[gaps.length - 1] : null,
    rowKeys: Object.keys(rows[0] ?? {}), sensorKeys: [...new Set(rows.flatMap(row => Object.keys(row.params ?? {})))] };
}
async function main() {
  const config = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env")));
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db(config.MONGODB_DB_NAME || "tmv_pwa");
    const key = (await db.collection("settings").findOne({ key: "GPS_API" }))?.value?.trim() || config.GPS_API;
    if (!key) throw new Error("GPS API is not configured.");
    const initials = process.argv[2];
    const jobs = await db.collection("jobs").find({ status: "COMPLETED", ...(initials ? { driverInitials: initials } : {}), actualFinishSource: { $ne: "admin-manual" }, gpsliveImei: { $exists: true, $ne: "" }, actualStart: { $gte: "2026-10-12" } },
      { projection: { _id: 0, jobId: 1, driverInitials: 1, gpsliveImei: 1, actualStart: 1, actualFinish: 1, pickupLocation: 1, dropoffLocation: 1 } }).sort({ actualFinish: -1 }).limit(10).toArray();
    const job = jobs.find(row => row.actualFinish && Date.parse(row.actualFinish) > Date.parse(row.actualStart));
    if (!job) throw new Error("No recent tracked job.");
    const end = Math.min(Date.now() - 60000, Date.parse(job.actualFinish) + 30 * 60000);
    const start = Math.max(Date.parse(job.actualStart), end - 6 * 3600000);
    const range = { dateFrom: DateTime.fromMillis(start).toUTC().toFormat("yyyy-MM-dd HH:mm:ss"), dateTo: DateTime.fromMillis(end).toUTC().toFormat("yyyy-MM-dd HH:mm:ss"), imei: job.gpsliveImei };
    const query = async (endpoint, body) => {
      const response = await fetch(`https://api.gpslive.app${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!response.ok) return { status: response.status };
      const data = await response.json();
      if (Array.isArray(data)) return { status: response.status, positions: profile(data) };
      return { status: response.status, responseKeys: Object.keys(data ?? {}), routes: profile(Array.isArray(data.routes) ? data.routes : []),
        drives: Array.isArray(data.drives) ? { count: data.drives.length, rowKeys: Object.keys(data.drives[0] ?? {}) } : null,
        stops: Array.isArray(data.stops) ? { count: data.stops.length, rowKeys: Object.keys(data.stops[0] ?? {}) } : null,
        events: Array.isArray(data.events) ? { count: data.events.length, types: [...new Set(data.events.map(row => row.type))] } : null };
    };
    const results = {};
    for (const endpoint of ["/v1/devices/history", "/v1/trip-history"]) results[endpoint] = await query(endpoint, endpoint.includes("trip") ? { ...range, minStopDuration: 5 } : range);
    const deviceResponse = await fetch("https://api.gpslive.app/v1/devices/list", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    let liveDevice = null;
    if (deviceResponse.ok) {
      const devices = await deviceResponse.json();
      const device = Array.isArray(devices) ? devices.find(row => row.imei === job.gpsliveImei) : null;
      if (device) liveDevice = { protocol: device.protocol ?? null, ignition: ignition(device), hasIgnitionField: Object.hasOwn(device.params ?? {}, "acc"),
        alternativeSensorValues: Object.fromEntries(["io239", "move", "gtosi"].filter(key => Object.hasOwn(device.params ?? {}, key)).map(key => [key, device.params[key]])) };
    }
    console.log(JSON.stringify({ mode: "read-only", jobId: job.jobId, initials: job.driverInitials, windowHours: (end - start) / 3600000,
      pickupCoordinatesSaved: !!job.pickupLocation, dropoffCoordinatesSaved: !!job.dropoffLocation, recentTrackedJobs: jobs.length,
      recentJobsWithDropoffCoordinates: jobs.filter(row => row.dropoffLocation).length, liveDevice, results }, null, 2));
  } finally { await client.close(); }
}
main().catch(() => { console.error("Read-only GPS capability audit could not complete; credentials and coordinates were not logged."); process.exitCode = 1; });
