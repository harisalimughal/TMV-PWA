import { Collection, Db, MongoClient } from "mongodb";
import { env } from "../config/env";
import { log } from "../utils/logger";

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

/** Creates the unique index on email if it doesn't exist yet. Safe to call every
 * startup -- createIndex is a no-op when the index already matches. */
export async function ensureIndexes(): Promise<void> {
  const col = await driverAccounts();
  await col.createIndex({ email: 1 }, { unique: true });
  log.info("mongo indexes verified");
}
