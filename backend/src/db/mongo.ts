import { Collection, Db, MongoClient } from "mongodb";
import { env } from "../config/env";
import { log } from "../utils/logger";
import { Job } from "../jobs/job.types";
import { EvidenceRecord } from "../jobs/job.types";

export interface DriverAccountDoc {
  /** Lower-cased, matches the "Email" column in the Drivers sheet -- the join key back
   * to the driver's real profile data, which stays in Sheets, not duplicated here. */
  email: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  /** Bumped on password change (or manual "log out everywhere") to invalidate every
   * session token issued before that point, without needing a sessions collection --
   * see auth/session.ts. */
  tokenVersion: number;
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

/** Creates indexes if they don't exist yet. Safe to call every startup -- createIndex
 * is a no-op when the index already matches. */
export async function ensureIndexes(): Promise<void> {
  const [accounts, jobs, evidence, activity] = await Promise.all([
    driverAccounts(), jobsCollection(), evidenceCollection(), activityCollection()
  ]);
  await Promise.all([
    accounts.createIndex({ email: 1 }, { unique: true }),
    jobs.createIndex({ calendarEventId: 1 }, { unique: true }),
    jobs.createIndex({ driverInitials: 1, status: 1 }),
    jobs.createIndex({ bookedStart: 1 }),
    evidence.createIndex({ jobId: 1 }),
    activity.createIndex({ jobId: 1, timestamp: 1 })
  ]);
  log.info("mongo indexes verified");
}
