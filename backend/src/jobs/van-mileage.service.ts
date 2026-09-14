import { VanRecordDoc } from "../db/van.repo";
import { VanComplianceDoc } from "../db/van-compliance.repo";

export interface VanMileageStatus {
  /** The most recent odometer-style reading for this van, reconciled across whichever
   *  record type last carried one (a Mileage log's `mileage`, a Fuel log's
   *  `odometerReading`, or a Service log's `serviceMileage`) -- these are three
   *  different fields for the same real-world number, never unified at write time. */
  currentMileage: number | null;
  /** The mileage baseline the "miles remaining" gauge counts from -- the most recent
   *  Service log's `serviceMileage` for this van. */
  lastServiceMileage: number | null;
}

export interface VanComplianceItem {
  vanRegistration: string;
  roadTaxRenewalDate?: string;
  motExpiryDate?: string;
  insuranceExpiryDate?: string;
  notes?: string;
  updatedAt?: string;
  serviceIntervalMiles: number | null;
  lastServiceMileageOverride: number | null;
  /** Effective baseline the gauge actually uses: the admin's override when set,
   *  otherwise the computed value from the most recent Service log. */
  lastServiceMileage: number | null;
  currentMileage: number | null;
}

/**
 * Reconciles a van's Mileage/Fuel/Service records into one "current odometer" signal
 * and finds its most recent service mileage -- scoped by vanRegistration, not by
 * driver, since a van can be reassigned between drivers and its service history
 * shouldn't reset when that happens.
 */
export function computeVanMileageStatus(records: VanRecordDoc[], vanRegistration: string): VanMileageStatus {
  const normalized = vanRegistration.trim().toUpperCase();
  let currentMileage: number | null = null;
  let currentAt = "";
  let lastServiceMileage: number | null = null;
  let lastServiceAt = "";

  for (const r of records) {
    if ((r.vanRegistration || "").trim().toUpperCase() !== normalized) continue;

    const reading = r.type === "SERVICE" ? r.serviceMileage : r.type === "FUEL" ? r.odometerReading : r.mileage;
    if (typeof reading === "number" && r.submittedAt > currentAt) {
      currentMileage = reading;
      currentAt = r.submittedAt;
    }

    if (r.type === "SERVICE" && typeof r.serviceMileage === "number" && r.submittedAt > lastServiceAt) {
      lastServiceMileage = r.serviceMileage;
      lastServiceAt = r.submittedAt;
    }
  }

  return { currentMileage, lastServiceMileage };
}

/** Merges a van's persisted compliance doc with its live-computed mileage status into
 *  the one shape both the driver app and admin dashboard read. */
export function toVanComplianceItem(
  vanRegistration: string, doc: VanComplianceDoc | null, records: VanRecordDoc[]
): VanComplianceItem {
  const computed = computeVanMileageStatus(records, vanRegistration);
  const override = doc?.lastServiceMileageOverride ?? null;
  return {
    vanRegistration,
    roadTaxRenewalDate: doc?.roadTaxRenewalDate,
    motExpiryDate: doc?.motExpiryDate,
    insuranceExpiryDate: doc?.insuranceExpiryDate,
    notes: doc?.notes,
    updatedAt: doc?.updatedAt,
    serviceIntervalMiles: doc?.serviceIntervalMiles ?? null,
    lastServiceMileageOverride: override,
    lastServiceMileage: override ?? computed.lastServiceMileage,
    currentMileage: computed.currentMileage
  };
}
