import { getDb } from "../db/mongo";
import type { RoadObligation } from "../gps/road-charge.rules";
import { ReportCapacityError } from "./driver-report.repo";

export async function reportRoadAllocations(imeis: string[], jobIds: string[], from: string, to: string): Promise<RoadObligation[]> {
  if (!imeis.length && !jobIds.length) return [];
  const documents = await (await getDb()).collection<{ rows: RoadObligation[] }>("road_charge_allocations").find({ $or: [
    { "rows": { $elemMatch: { imei: { $in: imeis }, occurredAt: { $gte: from, $lt: to } } } }, { "rows.jobId": { $in: jobIds } }
  ] }).limit(5001).toArray();
  if (documents.length > 5000) throw new ReportCapacityError("Too many road allocation ledgers; narrow the report range.");
  const rows = documents.flatMap(doc => doc.rows);
  if (rows.length > 50000) throw new ReportCapacityError("Too many road allocations; narrow the report range.");
  return rows;
}
