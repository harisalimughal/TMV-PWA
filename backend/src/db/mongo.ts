import { Collection, Db, MongoClient } from "mongodb";
import { env } from "../config/env";
import { log } from "../utils/logger";
import { Job } from "../jobs/job.types";
import { EvidenceRecord } from "../jobs/job.types";
import type { VanRecordDoc } from "./van.repo";
import type { VanComplianceDoc } from "./van-compliance.repo";

export interface DriverAccountDoc {
  /** Lower-cased. Primary lookup key for login. */
  email: string;
  /** "" until an admin sets a password (via the /admin Drivers screen) or the driver
   * completes a setup link -- verifyDriverPassword treats a blank hash as "can't log
   * in yet", never as a match. */
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  /** Bumped on password change, deactivation (or manual "log out everywhere") to
   * invalidate every session token issued before that point, without needing a
   * sessions collection -- see auth/session.ts. */
  tokenVersion: number;

  // ---------------------------------------------------------------------------
  // Profile fields -- migrated off the old Sheets "Drivers" tab (Aug 2026). This
  // collection is now the single source of truth for the driver roster, managed via
  // the /admin Drivers screen (see auth/admin.routes.ts).
  // ---------------------------------------------------------------------------
  /** Upper-cased. Matched against Job.driverInitials -- the join key between a job and
   * the driver assigned to it. */
  initials: string;
  fullName: string;
  phone: string;
  vanRegistration: string;
  role: string;
}

/** Job/booking data, formerly the Bookings sheet. _id is the jobId (deterministic,
 * derived from the Calendar event id -- see jobs/booking.service.ts's jobIdForEvent). */
export type JobDoc = Job & { _id: string };

/** Evidence (photo) records, formerly the Evidence sheet. Uploads are synchronous now
 * (Cloudinary, not a Chat-attachment-relay + Drive queue), so COMPLETED/FAILED is
 * usually set the moment the doc is first written -- RECEIVED/PROCESSING barely exist
 * in practice, kept only so a driver-initiated retry has somewhere to sit briefly. */
export type EvidenceDoc = EvidenceRecord & { _id: string };

export interface ActivityDoc {
  jobId: string;
  driver: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail?: string;
  timestamp: string;
}

/** Generic admin-editable key/value store -- replaces the old Sheets "Settings" tab.
 * See db/settings.repo.ts. */
export interface SettingDoc {
  key: string;
  value: string;
  updatedAt: Date;
}

export interface PushSubscriptionDoc {
  endpoint: string;
  /** Determined server-side from whichever session cookie was actually present on
   *  the /subscribe request (push/push.routes.ts) -- never trust a client-supplied
   *  role, or a driver's own device could mark itself "admin" and receive every
   *  admin-only alert (job completed, exceptions raised). Defaults to "driver" for
   *  a request with neither cookie (there's no legitimate way to subscribe from
   *  either app while logged out, so this is a defensive fallback, not an expected
   *  case). */
  role?: "admin" | "driver";
  driverInitials?: string;
  driverEmail?: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  platform?: "ios" | "android" | "desktop" | "unknown";
  createdAt: Date;
  updatedAt: Date;
}

let clientPromise: Promise<MongoClient> | null = null;

async function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(env.mongoUri);
    clientPromise = client.connect().catch(error => {
      clientPromise = null; // never cache a failed connection
      throw error;
    });
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(env.mongoDbName);
}

export async function driverAccounts(): Promise<Collection<DriverAccountDoc>> {
  const db = await getDb();
  return db.collection<DriverAccountDoc>("driver_accounts");
}

export async function jobsCollection(): Promise<Collection<JobDoc>> {
  const db = await getDb();
  return db.collection<JobDoc>("jobs");
}

export async function evidenceCollection(): Promise<Collection<EvidenceDoc>> {
  const db = await getDb();
  return db.collection<EvidenceDoc>("evidence");
}

export async function activityCollection(): Promise<Collection<ActivityDoc>> {
  const db = await getDb();
  return db.collection<ActivityDoc>("activity");
}

export async function settingsCollection(): Promise<Collection<SettingDoc>> {
  const db = await getDb();
  return db.collection<SettingDoc>("settings");
}

export async function pushSubscriptionsCollection(): Promise<Collection<PushSubscriptionDoc>> {
  const db = await getDb();
  return db.collection<PushSubscriptionDoc>("push_subscriptions");
}

/** Collection name kept as-is (predates the Fuel/Service record types) -- renaming a
 *  live Mongo collection isn't worth the migration risk for what's just an internal
 *  identifier. */
export async function vanRecordsCollection(): Promise<Collection<VanRecordDoc>> {
  const db = await getDb();
  return db.collection<VanRecordDoc>("van_mileage_records");
}

export async function vanComplianceCollection(): Promise<Collection<VanComplianceDoc>> {
  const db = await getDb();
  return db.collection<VanComplianceDoc>("van_compliance");
}

/** Creates indexes if they don't exist yet. Safe to call every startup -- createIndex
 * is a no-op when the index already matches. */
export async function ensureIndexes(): Promise<void> {
  const [accounts, jobs, evidence, activity, settings, pushSubs, vanRecords, vanCompliance] = await Promise.all([
    driverAccounts(), jobsCollection(), evidenceCollection(), activityCollection(), settingsCollection(), pushSubscriptionsCollection(), vanRecordsCollection(), vanComplianceCollection()
  ]);
  await Promise.all([
    accounts.createIndex({ email: 1 }, { unique: true }),
    // Sparse: legacy accounts created before the profile migration may briefly have no
    // initials, and a non-sparse unique index would reject a second such doc.
    accounts.createIndex({ initials: 1 }, { unique: true, sparse: true }),
    jobs.createIndex({ calendarEventId: 1 }, { unique: true }),
    jobs.createIndex({ driverInitials: 1, status: 1 }),
    jobs.createIndex({ bookedStart: 1 }),
    evidence.createIndex({ jobId: 1 }),
    activity.createIndex({ jobId: 1, timestamp: 1 }),
    settings.createIndex({ key: 1 }, { unique: true }),
    pushSubs.createIndex({ endpoint: 1 }, { unique: true }),
    pushSubs.createIndex({ driverInitials: 1 }),
    pushSubs.createIndex({ role: 1 }),
    vanRecords.createIndex({ submittedAt: -1 }),
    vanRecords.createIndex({ driverInitials: 1, submittedAt: -1 }),
    vanRecords.createIndex({ type: 1, submittedAt: -1 }),
    vanCompliance.createIndex({ vanRegistration: 1 }, { unique: true })
  ]);
  log.info("mongo indexes verified");
}
