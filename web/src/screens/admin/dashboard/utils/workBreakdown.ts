import type { NormalizedJob } from "../types";

const PACKING_CHARGE = "Packing Service";

export function jobServiceType(job: NormalizedJob): "Normal Service" | "Full/Packing Service" {
  if (job.extraChargeSelections?.includes(PACKING_CHARGE)) return "Full/Packing Service";
  const text = [
    job.rawTitle,
    job.rawDescription,
    job.bookingDetails?.notes,
    job.bookingDetails?.inventory,
    job.bookingDetails?.extraChargeText
  ].filter(Boolean).join("\n").toLowerCase();
  return /\b(pack|packing|full packing|packing service)\b/.test(text) ? "Full/Packing Service" : "Normal Service";
}

export function jobsForDriver(jobs: NormalizedJob[], driverInitials: string): NormalizedJob[] {
  const initials = driverInitials.toLowerCase();
  return jobs
    .filter(job => job.status === "COMPLETED" && job.driverInitials.toLowerCase() === initials)
    .sort((a, b) => (b.bookedStart || b.actualStart || "").localeCompare(a.bookedStart || a.actualStart || ""));
}
