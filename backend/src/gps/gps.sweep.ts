import { getGpsApiKey } from "../config/live-settings";
import { listJobs } from "../db/jobs.repo";
import { latestGpsRun } from "./gps.repo";
import { syncGpsHistory } from "./gps.sync";
import { log } from "../utils/logger";
import { reportFeatureEnabled } from "../reports/release-controls";

let running = false;
export async function sweepGpsHistory(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!reportFeatureEnabled("gpsHistory")) return;
    if (!(await getGpsApiKey())) return;
    const recent = (await listJobs()).filter(job => job.onMyWayAt && (job.status === "IN_PROGRESS" ||
      job.status === "READY" || (job.status === "COMPLETED" && Date.parse(job.actualFinish) >= now.getTime() - 6 * 3_600_000)));
    const imeis = [...new Set(recent.flatMap(job => [job.gpsliveImei, ...(job.gpsDeviceHistory ?? []).map(row => row.imei)]).filter((id): id is string => !!id))];
    const queue = [];
    for (const imei of imeis) queue.push({ imei, run: await latestGpsRun(imei) });
    queue.sort((a, b) => (a.run?.startedAt ?? "").localeCompare(b.run?.startedAt ?? ""));
    for (const { imei, run } of queue.slice(0, 2)) {
      if (run && run.status !== "queried") {
        await syncGpsHistory(imei, run.from, run.to, 18).catch(error => log.warn("GPS history resume failed", { error: String(error) }));
        continue;
      }
      const end = now.getTime() - 60_000;
      const start = Math.max(end - 6 * 3_600_000, run?.status === "queried" ? Date.parse(run.to) - 10 * 60_000 : end - 90 * 60_000);
      if (start >= end) continue;
      await syncGpsHistory(imei, new Date(start).toISOString(), new Date(end).toISOString(), 18)
        .catch(error => log.warn("GPS history sweep failed", { error: String(error) }));
    }
  } finally { running = false; }
}
