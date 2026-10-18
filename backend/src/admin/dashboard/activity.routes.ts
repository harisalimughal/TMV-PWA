import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import { activityCollection, getDb, type ActivityDoc } from "../../db/mongo";
import { getJob, listJobs } from "../../db/jobs.repo";
import { listDriverProfiles } from "../../auth/driver-account.service";

type Row = ActivityDoc & { _id?: unknown };
interface ReadMarker { _id: string; upToId: string }

// This adapter never changes an old activity row or claims it was a verified step.
export function activityEntry(row: Row) {
  const suffix = row._id ? String(row._id) : createHash("sha256").update(JSON.stringify(row)).digest("hex");
  const id = `${row.timestamp}:${suffix}`;
  const driver = /^[A-Z0-9]{2,8}$/.test(row.driver) && !["ADMIN", "SYSTEM"].includes(row.driver);
  return {
    id, jobId: row.jobId, kind: "operational" as const, type: "legacy.entry", category: "lifecycle" as const,
    actor: { role: driver ? "driver" as const : "system" as const, displayName: row.driver || "System", ...(driver ? { driverInitials: row.driver } : {}) },
    title: row.action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()),
    ...(row.detail ? { body: row.detail } : {}), occurredAt: row.timestamp, recordedAt: row.timestamp,
    source: "system" as const, verification: "system_recorded" as const,
    metadata: { legacy: true, originalAction: row.action }, idempotencyKey: id,
    ...(row.fromState ? { fromState: row.fromState } : {}), ...(row.toState ? { toState: row.toState } : {})
  };
}
type Entry = ReturnType<typeof activityEntry>;
const compare = (a: Entry, b: Entry) => a.id.localeCompare(b.id);
const limitOf = (req: Request) => Math.max(1, Math.min(100, Math.trunc(Number(req.query.limit) || 50)));
const capabilities = { canMessage: false, reason: "Use Notify Driver to send an office notification. Direct chat is not connected." };

export function activityPage(entries: Entry[], query: { before?: string; after?: string }, limit: number, conversation: boolean) {
  const all = [...entries].sort(compare);
  const eligible = all.filter(e => (!query.before || e.id < query.before) && (!query.after || e.id > query.after));
  const selected = conversation && query.after ? eligible.slice(0, limit) : eligible.slice(-limit);
  const first = selected[0], last = selected[selected.length - 1];
  return {
    items: conversation ? selected : selected.reverse(),
    ...(last ? { nextCursor: last.id } : {}),
    ...(first && all.some(e => e.id < first.id) ? { olderCursor: first.id } : {}),
    serverTime: new Date().toISOString(), ...(conversation ? { capabilities } : {})
  };
}

export function dashboardActivityRoutes(): Router {
  const router = Router();
  const markers = async () => (await getDb()).collection<ReadMarker>("admin_activity_reads");
  const readEntries = async (jobId?: string) => {
    const rows = await (await activityCollection()).find(jobId ? { jobId } : {}).toArray();
    return rows.filter(row => Number.isFinite(Date.parse(row.timestamp))).map(activityEntry);
  };
  router.get("/jobs/:jobId/activity", async (req, res, next) => {
    try {
      if (!await getJob(String(req.params.jobId))) { res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: "Job not found." } }); return; }
      res.json(activityPage(await readEntries(String(req.params.jobId)), req.query as { before?: string; after?: string }, limitOf(req), true));
    } catch (error) { next(error); }
  });
  router.post("/jobs/:jobId/activity/read", async (req, res, next) => {
    try {
      const jobId = String(req.params.jobId), id = req.body?.upToId;
      if (typeof id !== "string" || !(await readEntries(jobId)).some(e => e.id === id)) {
        res.status(400).json({ error: { code: "INVALID_CURSOR", message: "Choose an activity entry from this job." } }); return;
      }
      // There is one shared admin identity in the existing authentication system.
      await (await markers()).updateOne({ _id: jobId }, { $max: { upToId: id } }, { upsert: true });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  router.get("/activity/unread", async (_req, res, next) => {
    try {
      const [entries, reads, jobs] = await Promise.all([readEntries(), (await markers()).find({}).toArray(), listJobs()]);
      const known = new Set(jobs.map(j => j.jobId)), read = new Map(reads.map(r => [r._id, r.upToId]));
      res.json({ total: entries.filter(e => known.has(e.jobId) && e.id > (read.get(e.jobId) || "")).length, serverTime: new Date().toISOString() });
    } catch (error) { next(error); }
  });
  router.get(["/activity", "/activity/conversations"], async (req, res, next) => {
    try {
      const [entries, jobs, drivers, reads] = await Promise.all([readEntries(), listJobs(), listDriverProfiles(), (await markers()).find({}).toArray()]);
      const read = new Map(reads.map(r => [r._id, r.upToId]));
      const query = req.query, q = String(query.q || "").toLowerCase();
      const selectedJobs = jobs.filter(j => (!query.driver || j.driverInitials === query.driver) && (!q || [j.jobId, j.customerName, j.driverInitials].some(s => s?.toLowerCase().includes(q))));
      const ids = new Set(selectedJobs.map(j => j.jobId));
      const types = String(query.types || "").split(",").filter(Boolean);
      const filtered = entries.filter(e => ids.has(e.jobId) && (!query.category || e.category === query.category) && (!types.length || types.includes(e.type)) && (!query.from || e.recordedAt >= String(query.from)) && (!query.to || e.recordedAt <= String(query.to)));
      if (req.path === "/activity") { res.json(activityPage(filtered, query as { before?: string; after?: string }, limitOf(req), false)); return; }
      let conversations = selectedJobs.map(j => {
        const stream = filtered.filter(e => e.jobId === j.jobId).sort(compare), last = stream[stream.length - 1];
        return {
          jobId: j.jobId, customerName: j.customerName,
          driver: { initials: j.driverInitials, name: drivers.find(d => d.initials === j.driverInitials)?.fullName || j.driverInitials },
          jobStatus: j.status, currentState: j.currentState, bookedStart: j.bookedStart,
          lastMessage: last, lastActivityAt: last?.recordedAt || j.createdAt,
          unreadCount: stream.filter(e => e.id > (read.get(j.jobId) || "")).length, capabilities
        };
      }).filter(c => (!(query.category || types.length || query.from || query.to) || c.lastMessage) && (query.unreadOnly !== "true" || c.unreadCount > 0));
      conversations.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.jobId.localeCompare(b.jobId));
      if (query.after) {
        const index = conversations.findIndex(c => c.jobId === query.after);
        if (index < 0) { res.status(400).json({ error: { code: "INVALID_CURSOR", message: "Reload the conversation list." } }); return; }
        conversations = conversations.slice(index + 1);
      }
      const items = conversations.slice(0, limitOf(req));
      res.json({ items, ...(conversations.length > items.length ? { nextCursor: items[items.length - 1].jobId } : {}), serverTime: new Date().toISOString() });
    } catch (error) { next(error); }
  });
  return router;
}
