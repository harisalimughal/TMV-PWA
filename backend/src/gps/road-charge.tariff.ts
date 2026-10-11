import { getSetting } from "../db/settings.repo";
import { env } from "../config/env";
import type { Job } from "../jobs/job.types";
import { parseRoadRate, ROAD_RULE_VERSION } from "./road-charge.rules";

/** Prospective only: never assign today's prices to an already active/completed job. */
export async function captureRoadTariff(job: Job, at: string): Promise<void> {
  if (job.roadTariffSnapshot || job.status === "COMPLETED" || job.actualStart) return;
  const congestion = await getSetting("CONGESTION_CHARGE", String(env.congestionCharge));
  const tunnel = await getSetting("TUNNEL_CHARGE", String(env.tunnelCharge));
  job.roadTariffSnapshot = { version: ROAD_RULE_VERSION, effectiveFrom: at, capturedAt: at,
    congestionPence: parseRoadRate(congestion), tunnelPence: parseRoadRate(tunnel), source: "pricing-settings" };
}
