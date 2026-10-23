import { getDb } from "../db/mongo";
import { createErrorRecorder, slowRequestThreshold, type LogKind, type ServerErrorRecord } from "./server-errors";
import type { Filter } from "mongodb";

const collection = async () => (await getDb()).collection<ServerErrorRecord>("admin_server_errors");
export const errorRecorder = createErrorRecorder(async rows => (await collection()).insertMany(rows, { ordered: false, timeoutMS: 5000 }));
export async function ensureServerErrorIndexes() { const col = await collection(); await Promise.all([col.createIndex({ occurredAt: -1, _id: -1 }), col.createIndex({ kind: 1, occurredAt: -1, _id: -1 })]); }
export function serverLogFilter(from: string, to: string, kind: LogKind | "all" = "all"): Filter<ServerErrorRecord> {
  return { occurredAt: { $gte: new Date(from), $lt: new Date(to) }, ...(kind === "all" ? {} : kind === "server_error" ? { $or: [{ kind: "server_error" }, { kind: { $exists: false } }] } : { kind }) };
}
export async function listServerErrors(from: string, to: string, page: number, pageSize: number, kind: LogKind | "all" = "all") {
  const col = await collection();
  const filter = serverLogFilter(from, to, kind);
  const [rows, total] = await Promise.all([
    col.find(filter).project<ServerErrorRecord>({ _id: 1, occurredAt: 1, area: 1, areaLabel: 1, title: 1, summary: 1, nextStep: 1, requestId: 1, jobId: 1, kind: 1, httpStatus: 1, durationMs: 1, audience: 1,
      method: 1, endpoint: 1, operation: 1, page: 1, requestStartedAt: 1, buildId: 1, serverRunId: 1, timings: 1, filters: 1
    }).sort({ occurredAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).maxTimeMS(10000).toArray(),
    col.countDocuments(filter, { maxTimeMS: 10000 })
  ]);
  return { items: rows.map(({ _id, occurredAt, ...row }) => ({ ...row, kind: row.kind ?? "server_error", id: _id, occurredAt: occurredAt.toISOString() })), total, page, pageSize, capture: { ...errorRecorder.status(), slowRequestMs: slowRequestThreshold() } };
}
