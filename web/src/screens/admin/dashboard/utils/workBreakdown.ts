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

export function paymentBreakdownLines(job: NormalizedJob): string[] {
  if (!job.paymentBreakdown?.length) return [job.paymentMethod || "Not recorded"];
  return job.paymentBreakdown.flatMap(row => {
    const method = row.method || "Not recorded";
    if (method.toLowerCase() === "invoice" && row.amount === 0) return "Invoice outstanding";
    const splitMethods = method.split(",").map(part => part.trim()).filter(Boolean);
    if (splitMethods.length > 1) {
      return splitMethods;
    }
    return `${method} £${((row.amount || 0) / 100).toFixed(2)}`;
  });
}

export function totalChargesForJob(job: NormalizedJob): number {
  return job.totalCharges || job.calculatedTotalCharges || (job.basePrice || 0) + (job.extraCharges || 0) + (job.overtimeCharge || 0);
}

export function adjustmentReason(job: NormalizedJob): string {
  return job.totalAdjustmentNote?.trim() || "None";
}

export function extraChargeBreakdownLines(job: NormalizedJob): string[] {
  if (!job.extraChargeBreakdown?.length) return ["None"];
  return job.extraChargeBreakdown.map(row => `${row.label || "Extra"} £${((row.amount || 0) / 100).toFixed(2)}`);
}
