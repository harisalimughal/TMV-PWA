const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { MongoClient } = require("mongodb");
const { google } = require("googleapis");
const { DateTime } = require("luxon");
const { env, createGoogleAuth, SCOPES } = require("../src/config/env.ts");
const { parseCalendarEvent, jobIdForEvent } = require("../src/jobs/booking.service.ts");

async function main() {
  const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db(env.mongoDbName);
    const accounts = await db.collection("driver_accounts").find(
      { $or: [{ fullName: /henrique/i }, { initials: /^HE$/i }] },
      { projection: { _id: 0, fullName: 1, initials: 1, active: 1, role: 1, updatedAt: 1 } }
    ).toArray();
    console.log(JSON.stringify({ mode: "read-only", accounts }));
    const incidentJobId = "TMV-29625CCA7B";
    const incident = await db.collection("jobs").findOne({ jobId: incidentJobId }, { projection: {
      _id: 0, jobId: 1, calendarEventId: 1, driverInitials: 1, status: 1, currentState: 1,
      bookedStart: 1, bookedFinish: 1, actualStart: 1, actualFinish: 1, actualStartSource: 1,
      actualFinishSource: 1, reportIdentity: 1, "timeBilling.driverInitials": 1, createdAt: 1, updatedAt: 1
    } });
    const activity = await db.collection("activity").find({ jobId: incidentJobId }, { projection: {
      _id: 0, action: 1, timestamp: 1, fromState: 1, toState: 1, detail: 1
    } }).sort({ timestamp: 1 }).toArray();
    console.log(JSON.stringify({ incident, activity }));
    const calendar = google.calendar({ version: "v3", auth: await createGoogleAuth(SCOPES.CALENDAR) });
    for (const day of ["2026-10-14", "2026-10-15"]) {
      const start = DateTime.fromISO(day, { zone: "Europe/London" }).startOf("day");
      let pageToken;
      let count = 0;
      let pages = 0;
      const matches = [];
      do {
        const response = await calendar.events.list({ calendarId: env.calendarId,
          timeMin: start.toUTC().toISO(), timeMax: start.plus({ days: 1 }).toUTC().toISO(),
          singleEvents: true, showDeleted: true, orderBy: "startTime", maxResults: 250, pageToken });
        pages += 1;
        for (const event of response.data.items || []) {
          count += 1;
          const title = event.summary || "";
          if (!/HE\b|henrique/i.test(title) && !/Edoardo|Porpiglia/i.test(event.description || "")) continue;
          const parsed = parseCalendarEvent(event);
          const stored = await db.collection("jobs").findOne({ calendarEventId: event.id },
            { projection: { _id: 0, jobId: 1, driverInitials: 1, customerName: 1, bookedStart: 1,
              bookedFinish: 1, status: 1, currentState: 1, rawTitle: 1, createdAt: 1, updatedAt: 1 } });
          matches.push({ eventId: event.id, title, status: event.status, start: event.start, end: event.end,
            updated: event.updated, page: pages, parsed: parsed ? { driverInitials: parsed.driverInitials,
              customerName: parsed.customerName, bookedStart: parsed.bookedStart } : null, stored });
        }
        pageToken = response.data.nextPageToken;
      } while (pageToken);
      const jobs = await db.collection("jobs").find({ driverInitials: /^HE$/i,
        bookedStart: { $gte: day, $lt: start.plus({ days: 1 }).toISODate() } },
        { projection: { _id: 0, jobId: 1, driverInitials: 1, status: 1, currentState: 1, bookedStart: 1, rawTitle: 1 } }).toArray();
      console.log(JSON.stringify({ day, totalEvents: count, pages, matches, driverJobs: jobs }));
    }
  } finally { await client.close(); }
}
main().catch(error => { console.error(JSON.stringify({ error: error.code || error.name, message: "Read-only calendar audit failed; credentials omitted." })); process.exitCode = 1; });
