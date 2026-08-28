import bcrypt from "bcryptjs";
import { driverAccounts, DriverAccountDoc } from "../db/mongo";

const BCRYPT_ROUNDS = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sets (creates or overwrites) a driver's password. Called from the admin dashboard's
 * Add/Edit Driver flow -- ops sets the password directly, drivers don't self-serve.
 * Overwriting is intentional: re-using this for "reset password" needs no separate path.
 */
export async function setDriverPassword(email: string, plainPassword: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const now = new Date();
  const col = await driverAccounts();

  await col.updateOne(
    { email: normalized },
    {
      $set: { passwordHash, active: true, updatedAt: now },
      // $inc tokenVersion so any session token issued before this password change stops
      // validating -- a changed password should always log out every existing device.
      $inc: { tokenVersion: 1 },
      $setOnInsert: { email: normalized, createdAt: now, lastLoginAt: null }
    },
    { upsert: true }
  );
}

/** Deactivates a driver's account without deleting it -- mirrors how Sheets driver rows
 * are soft-deactivated (Active column), never hard-deleted. Also invalidates sessions. */
export async function deactivateDriverAccount(email: string): Promise<void> {
  const col = await driverAccounts();
  await col.updateOne(
    { email: normalizeEmail(email) },
    { $set: { active: false, updatedAt: new Date() }, $inc: { tokenVersion: 1 } }
  );
}

export interface VerifyResult {
  ok: boolean;
  account?: DriverAccountDoc;
  reason?: "not_found" | "inactive" | "wrong_password";
}

export async function verifyDriverPassword(email: string, plainPassword: string): Promise<VerifyResult> {
  const col = await driverAccounts();
  const account = await col.findOne({ email: normalizeEmail(email) });
  if (!account) return { ok: false, reason: "not_found" };
  if (!account.active) return { ok: false, reason: "inactive" };

  const matches = await bcrypt.compare(plainPassword, account.passwordHash);
  if (!matches) return { ok: false, reason: "wrong_password" };

  await col.updateOne({ email: account.email }, { $set: { lastLoginAt: new Date() } });
  return { ok: true, account };
}

export async function getDriverAccount(email: string): Promise<DriverAccountDoc | null> {
  const col = await driverAccounts();
  return col.findOne({ email: normalizeEmail(email) });
}
