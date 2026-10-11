/* Read-only diagnostic. Never import the server or create database indexes here. */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { DateTime } = require("luxon");

const envPath = path.resolve(__dirname, "../.env");
const config = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
const env = { ...config, ...process.env };
const settingKeys = ["CONGESTION_CHARGE", "TUNNEL_CHARGE", "OVERTIME_RATE_PER_30", "OVERTIME_GRACE_MINS",
  "CREW_BILLING_UNIT", "PACKING_RATE", "CREW_RATE_1_MAN", "CREW_RATE_2_MAN", "CREW_RATE_3_MAN", "GPS_API"];
const summary = { observedAt: new Date().toISOString(), readOnly: true };
const keysOf = rows => [...new Set(rows.flatMap(row => Object.keys(row || {})))].sort();
const frequencies = values => values.reduce((out, value) => {
  const key = String(value ?? "missing");
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});
const duration = (start, end) => {
  const a = Date.parse(start), b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 60_000 : null;
};

async function api(endpoint, apiKey, body) {
  const response = await fetch(`https://api.gpslive.app${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) return { status: response.status, rows: [] };
  const data = await response.json();
  return { status: response.status, rows: Array.isArray(data) ? data : [], data,
    responseKeys: Array.isArray(data) ? [] : Object.keys(data || {}),
    rateLimitHeaders: Object.fromEntries([...response.headers].filter(([key]) => /ratelimit|retry-after/i.test(key))) };
}

async function main() {
  if (process.argv.includes("--docs-only")) {
    const response = await fetch("https://api.gpslive.app/api-docs/v1", { signal: AbortSignal.timeout(12_000) });
    const html = await response.text();
    console.log(JSON.stringify({ status: response.status, url: response.url,
      scriptAssets: Array.from(html.matchAll(/src="([^"]+)"/g), match => match[1]),
      configurationHints: html.split("\n").filter(line => /swagger|spec|json|yaml/i.test(line)).slice(0, 20)
    }, null, 2));
    return;
  }
  const docAsset = process.argv.find(value => value.startsWith("--doc-asset="))?.slice("--doc-asset=".length);
  if (docAsset) {
    if (!docAsset.startsWith("/api-docs/v1/") || docAsset.includes("..")) throw new Error("Invalid public documentation asset.");
    const response = await fetch(`https://api.gpslive.app${docAsset}`, { signal: AbortSignal.timeout(12_000) });
    const source = await response.text();
    const marker = "let options = ";
    const start = source.indexOf(marker) + marker.length;
    const end = source.indexOf(";\n", start);
    const options = JSON.parse(source.slice(start, end).trim());
    const doc = options.swaggerDoc;
    const schemaFor = ref => doc.components?.schemas?.[String(ref).split("/").at(-1)];
    const describeSchema = schema => schema && ({ fields: Object.keys(schema.properties || {}), required: schema.required });
    const relevant = Object.entries(doc.paths).filter(([endpoint]) => /route|trip|history|overview|alerts|zones|platform/i.test(endpoint));
    console.log(JSON.stringify({
      endpoints: relevant.map(([endpoint, methods]) => ({ endpoint, methods: Object.entries(methods).map(([method, spec]) => ({
        method, summary: spec.summary, parameters: spec.parameters,
        requestSchema: describeSchema(schemaFor(spec.requestBody?.content?.["application/json"]?.schema?.$ref)),
        responseSchema: describeSchema(schemaFor(spec.responses?.default?.content?.["application/json"]?.schema?.$ref))
      })) })),
      relatedSchemas: Object.fromEntries(Object.entries(doc.components?.schemas || {}).filter(([name]) => /route|trip|history|alert|timezone|overview/i.test(name))
        .map(([name, schema]) => [name, describeSchema(schema)]))
    }, null, 2));
    return;
  }
  let apiKey = env.GPS_API || "";
  const uri = env.MONGODB_URI;
  if (!uri) summary.database = { available: false, reason: "missing_configuration" };
  else {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 });
    try {
      await client.connect();
      const db = client.db(env.MONGODB_DB_NAME || "tmv_pwa");
      const [settings, jobs, manuals, drivers, incidents] = await Promise.all([
        db.collection("settings").find({ key: { $in: settingKeys } }, { projection: { _id: 0, key: 1, value: 1 }, maxTimeMS: 10_000 }).toArray(),
        db.collection("jobs").find({}, { projection: { _id: 0, jobId: 1, status: 1, bookedStart: 1, bookedFinish: 1,
          actualStart: 1, actualFinish: 1, extraChargeText: 1, basePrice: 1, paidOnline: 1, paymentMethod: 1,
          paymentStatus: 1, paymentBreakdown: 1, amountCharged: 1, calculatedTotalCharges: 1,
          gpsliveImei: 1, trackerArrivalAt: 1, congestionZoneEnteredAt: 1, tunnelZoneEnteredAt: 1 }, maxTimeMS: 10_000 }).toArray(),
        db.collection("driver_job_summaries").find({}, { projection: { _id: 0, jobId: 1, startTime: 1, endTime: 1,
          amountCollectedPence: 1, paymentBreakdown: 1, helperHours: 1 }, maxTimeMS: 10_000 }).toArray(),
        db.collection("driver_accounts").find({}, { projection: { _id: 0, imei: 1 }, maxTimeMS: 10_000 }).toArray(),
        db.collection("scenario_submissions").aggregate([{ $group: { _id: "$scenario", count: { $sum: 1 } } }], { maxTimeMS: 10_000 }).toArray()
      ]);
      const settingsByKey = new Map(settings.map(row => [row.key, row.value]));
      apiKey = settingsByKey.get("GPS_API") || apiKey;
      const manualByJob = new Map(manuals.map(row => [row.jobId, row]));
      const completed = jobs.filter(job => job.status === "COMPLETED");
      const methodValues = new Set(["Cash", "Card", "Link", "Bank Transfer", "Invoice", "Invoice/Transfer"]);
      summary.database = {
        available: true, jobCount: jobs.length, completedCount: completed.length,
        jobStatuses: frequencies(jobs.map(job => job.status)),
        pricingSettings: Object.fromEntries(settings.filter(row => row.key !== "GPS_API").map(row => [row.key, row.value])),
        envPricingFallbacks: { timezone: env.TMV_TIMEZONE || "Europe/London", congestionPounds: Number(env.TMV_CONGESTION_CHARGE || 18),
          tunnelPounds: Number(env.TMV_TUNNEL_CHARGE || 13), graceMinutes: Number(env.TMV_OVERTIME_GRACE_MINUTES || 0) },
        calendarRateTextPresent: jobs.filter(job => job.extraChargeText).length,
        calendarRateUnits: frequencies(jobs.filter(job => job.extraChargeText).map(job => /half|30\s*(?:min)/i.test(job.extraChargeText) ? "half_hour" : /hour|\bhr\b/i.test(job.extraChargeText) ? "hour" : "unknown")),
        nonWholeHourBookings: jobs.filter(job => { const d = duration(job.bookedStart, job.bookedFinish); return d > 0 && d % 60 !== 0; }).length,
        invalidBookingDurations: jobs.filter(job => { const d = duration(job.bookedStart, job.bookedFinish); return d === null || d <= 0; }).length,
        missingCompletedBoundaries: completed.filter(job => !job.actualStart || !job.actualFinish).length,
        paidOnlineJobs: jobs.filter(job => job.paidOnline).length,
        splitPaymentJobs: jobs.filter(job => job.paymentBreakdown?.length > 1).length,
        paymentMethods: frequencies(jobs.flatMap(job => (job.paymentBreakdown || []).map(row => methodValues.has(row.method) ? row.method : "unknown_method"))),
        amountVsRecordedPaymentMismatch: completed.filter(job => Array.isArray(job.paymentBreakdown) &&
          Math.round(job.paymentBreakdown.reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) !== Math.round(Number(job.amountCharged || 0) * 100)).length,
        manuals: { count: manuals.length, completedWithoutManual: completed.filter(job => !manualByJob.has(job.jobId)).length,
          orphanCount: manuals.filter(row => !jobs.some(job => job.jobId === row.jobId)).length,
          totalHelperHours: manuals.reduce((sum, row) => sum + Number(row.helperHours || 0), 0) },
        trackerLinkedJobs: jobs.filter(job => job.gpsliveImei).length,
        trackerArrivalJobs: jobs.filter(job => job.trackerArrivalAt).length,
        congestionFlaggedJobs: jobs.filter(job => job.congestionZoneEnteredAt).length,
        tunnelFlaggedJobs: jobs.filter(job => job.tunnelZoneEnteredAt).length,
        driversWithAssignedTracker: drivers.filter(row => row.imei).length,
        incidents: Object.fromEntries(incidents.map(row => [row._id, row.count])),
        representativeCompletedSamples: completed.slice(-3).map((job, index) => ({
          label: `sample-${index + 1}`, scheduledMinutes: duration(job.bookedStart, job.bookedFinish),
          actualMinutes: duration(job.actualStart, job.actualFinish),
          systemExpectedPence: Math.round(Number(job.calculatedTotalCharges || 0) * 100),
          systemFinalPricePence: Math.round(Number(job.amountCharged || 0) * 100),
          recordedPaymentPence: (job.paymentBreakdown || []).map(row => ({ method: methodValues.has(row.method) ? row.method : "unknown_method", amountPence: Math.round(Number(row.amount || 0) * 100) })),
          manualCollectionPence: manualByJob.get(job.jobId)?.amountCollectedPence ?? null,
          paidOnline: !!job.paidOnline
        }))
      };
    } catch (error) {
      summary.database = { available: false, errorType: error.name, errorCode: typeof error.code === "string" ? error.code : undefined };
      process.exitCode = 1;
    } finally { await client.close(); }
  }

  if (!apiKey) summary.gps = { available: false, reason: "missing_configuration" };
  else try {
    const devices = await api("/v1/devices/list", apiKey);
    const zones = await api("/v1/places/zones", apiKey);
    const notifications = await api("/v1/alerts/notifications", apiKey);
    const active = devices.rows.filter(row => !["false", "0", "no", "inactive"].includes(String(row.active).toLowerCase()));
    const sorted = [...active].sort((a, b) => String(b.dtTracker).localeCompare(String(a.dtTracker)));
    let history = { status: null, rows: [] };
    const now = DateTime.utc();
    let inspectedDevices = 0;
    for (const device of sorted.slice(0, 3)) {
      inspectedDevices++;
      history = await api("/v1/alerts/custom", apiKey, { dateFrom: now.minus({ days: 7 }).toFormat("yyyy-MM-dd HH:mm:ss"),
        dateTo: now.toFormat("yyyy-MM-dd HH:mm:ss"), imeis: [device.imei], search: "", limit: 50 });
      if (history.rows.length) break;
    }
    const observedEvents = [...notifications.rows, ...history.rows];
    const sampleDevice = sorted[0];
    const interval = sampleDevice ? { imei: sampleDevice.imei, dateFrom: now.minus({ hours: 2 }).toFormat("yyyy-MM-dd HH:mm:ss"),
      dateTo: now.toFormat("yyyy-MM-dd HH:mm:ss") } : null;
    const positions = interval ? await api("/v1/devices/history", apiKey, interval) : { status: null, rows: [] };
    const trips = interval ? await api("/v1/trip-history", apiKey, { ...interval, minStopDuration: 5 }) : { status: null, data: {} };
    const tripData = trips.data || {};
    const positionTimes = positions.rows.map(row => DateTime.fromSQL(row.dtTracker || "", { zone: "utc" }).toMillis()).filter(Number.isFinite).sort((a, b) => a - b);
    const gapsSeconds = positionTimes.slice(1).map((time, index) => (time - positionTimes[index]) / 1000).filter(gap => gap > 0).sort((a, b) => a - b);
    summary.gps = {
      available: devices.status === 200, statuses: { devices: devices.status, zones: zones.status, notifications: notifications.status, history: history.status },
      deviceCount: devices.rows.length, activeDeviceCount: active.length, deviceFieldNames: keysOf(devices.rows),
      zoneFieldNames: keysOf(zones.rows),
      relevantZones: zones.rows.filter(zone => /congestion|tunnel|dartford|blackwall|silvertown/i.test(zone.zoneName || "")).map(zone => ({
        zoneId: zone.zoneId, name: zone.zoneName, vertexCount: Array.isArray(zone.zoneVertices) ? zone.zoneVertices.length : 0,
        distinctVertexCount: Array.isArray(zone.zoneVertices) ? new Set(zone.zoneVertices.map(vertex => JSON.stringify(vertex))).size : 0
      })),
      eventFieldNames: keysOf(observedEvents), eventTypes: frequencies(observedEvents.map(row => row.type)),
      eventDeviceFieldNames: keysOf(observedEvents.map(row => row.device)),
      eventsWithStableId: observedEvents.filter(row => row.event_id).length,
      eventsWithCoordinates: observedEvents.filter(row => (row.lat != null && row.lng != null) || (row.latitude != null && row.longitude != null)).length,
      notificationsCount: notifications.rows.length, historySampleCount: history.rows.length,
      historyDevicesInspected: inspectedDevices, historyWindowDays: 7,
      historyReachedRequestedLimit: history.rows.length >= 50,
      trackerTimestampOffsetPresent: devices.rows.some(row => /(?:Z|[+-]\d{2}:?\d{2})$/.test(row.dtTracker || "")),
      latestTrackerAgeMinutesIfUTC: sampleDevice ? Math.round(now.diff(DateTime.fromSQL(sampleDevice.dtTracker, { zone: "utc" }), "minutes").minutes * 100) / 100 : null,
      latestTrackerAgeMinutesIfLondon: sampleDevice ? Math.round(now.diff(DateTime.fromSQL(sampleDevice.dtTracker, { zone: "Europe/London" }), "minutes").minutes * 100) / 100 : null,
      observedRateLimitHeaders: devices.rateLimitHeaders,
      positions: { status: positions.status, fieldNames: keysOf(positions.rows), sampleCount: positions.rows.length,
        medianPositiveGapSeconds: gapsSeconds[Math.floor(gapsSeconds.length / 2)] ?? null,
        maximumGapSeconds: gapsSeconds.at(-1) ?? null },
      trips: { status: trips.status, responseFieldNames: Object.keys(tripData), routeFieldNames: keysOf(tripData.routes || []),
        driveFieldNames: keysOf(tripData.drives || []), eventFieldNames: keysOf(tripData.events || []),
        routeSampleCount: tripData.routes?.length ?? 0, driveSampleCount: tripData.drives?.length ?? 0,
        eventSampleCount: tripData.events?.length ?? 0, movingDurationNumeric: tripData.drives_duration_time ?? null,
        movingDurationFormatted: tripData.drives_duration ?? null,
        eventCoordinatesAvailable: (tripData.events || []).some(row => row.lat != null && row.lng != null) }
    };
    if ([devices.status, zones.status, notifications.status, history.status].some(status => status && (status < 200 || status >= 300))) process.exitCode = 1;
  } catch (error) {
    summary.gps = { available: false, errorType: error.name, errorCode: error.cause?.code };
    process.exitCode = 1;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => { console.log(JSON.stringify({ readOnly: true, failed: true, errorType: error.name })); process.exitCode = 1; });
