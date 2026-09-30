import type { EvidenceItem } from "../api/jobs";

export const VAN_LOAD_OVERDUE_MINUTES = 15;

export interface VanLoadTiming {
  pickupArrivalAt?: string;
  vanLoadedAt?: string;
  delayMinutes?: number;
  late: boolean;
  overdue: boolean;
}

interface VanLoadTimingOptions {
  requireArrivalEvidence?: boolean;
}

function evidenceTime(item: EvidenceItem | undefined): string | undefined {
  return item?.capturedAt;
}

function minutesBetween(start: string, finish: Date): number | undefined {
  const startMs = new Date(start).getTime();
  const finishMs = finish.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) return undefined;
  return Math.floor((finishMs - startMs) / 60000);
}

function minutesBetweenIso(start: string, finish: string): number | undefined {
  const finishDate = new Date(finish);
  return minutesBetween(start, finishDate);
}

export function getVanLoadTiming(
  evidenceItems: EvidenceItem[],
  now: Date,
  fallbackPickupArrivalAt?: string,
  options: VanLoadTimingOptions = {}
): VanLoadTiming {
  const arrival = evidenceItems.find(item => item.evidenceType === "Arrival");
  const loaded = evidenceItems.find(item => item.evidenceType === "VanLoaded");
  const pickupArrivalAt = evidenceTime(arrival) || (options.requireArrivalEvidence ? undefined : fallbackPickupArrivalAt) || undefined;
  const vanLoadedAt = evidenceTime(loaded);

  if (!pickupArrivalAt) {
    return { late: false, overdue: false };
  }

  if (vanLoadedAt) {
    const delayMinutes = minutesBetweenIso(pickupArrivalAt, vanLoadedAt);
    return {
      pickupArrivalAt,
      vanLoadedAt,
      delayMinutes,
      late: typeof delayMinutes === "number" && delayMinutes > VAN_LOAD_OVERDUE_MINUTES,
      overdue: false
    };
  }

  const delayMinutes = minutesBetween(pickupArrivalAt, now);
  return {
    pickupArrivalAt,
    delayMinutes,
    late: false,
    overdue: typeof delayMinutes === "number" && delayMinutes > VAN_LOAD_OVERDUE_MINUTES
  };
}

export function vanLoadOverdueBody(): string {
  return `More than ${VAN_LOAD_OVERDUE_MINUTES} min has passed, you didn't upload van loaded pic. Hurry up.`;
}
