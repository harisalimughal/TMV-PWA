import type { Job } from "../api/jobs";

export type LiabilityCheckpoint = "pickup" | "stopby" | "dropoff";

export const liabilityCheckpointOptions: Array<{ value: LiabilityCheckpoint; label: string }> = [
  { value: "pickup", label: "Pickup" },
  { value: "stopby", label: "Stop-by" },
  { value: "dropoff", label: "Drop-off" }
];

export interface LiabilityJobBuckets {
  today: Job[];
  past: Job[];
  next: Job[];
}

export function pickLiabilityJob(buckets: LiabilityJobBuckets, requestedJobId?: string): Job | null {
  const all = [...buckets.today, ...buckets.next, ...buckets.past];
  if (requestedJobId) {
    const requested = all.find(job => job.jobId === requestedJobId);
    if (requested) return requested;
  }
  return all.find(job => job.status === "IN_PROGRESS") ?? null;
}

export function reportedAtForLiabilityCheckpoint(
  checkpoint: LiabilityCheckpoint,
  job: Job
): { label: "Pickup" | "Stop-by" | "Drop-off"; address?: string } {
  switch (checkpoint) {
    case "pickup":
      return { label: "Pickup", address: job.pickup };
    case "stopby":
      return { label: "Stop-by", address: job.stopBy };
    case "dropoff":
      return { label: "Drop-off", address: job.dropoff };
  }
}

export function liabilityCheckpointForWorkflowState(state: string): LiabilityCheckpoint | null {
  switch (state) {
    case "WAITING_ARRIVAL_ISSUES_CHECK":
    case "WAITING_ARRIVAL_ISSUES_CHOICE":
      return "pickup";
    case "WAITING_STOP_BY_ISSUES_CHECK":
    case "WAITING_STOP_BY_ISSUES_CHOICE":
      return "stopby";
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return "dropoff";
    default:
      return null;
  }
}
