import bcrypt from "bcryptjs";
import { driverAccounts, DriverAccountDoc } from "../db/mongo";
import { DriverProfile } from "../jobs/job.types";

const BCRYPT_ROUNDS = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toDriverProfile(doc: DriverAccountDoc): DriverProfile {
  return {
    initials: doc.initials || "",
    fullName: doc.fullName || doc.email,
    email: doc.email,
    chatUserName: "",
    active: doc.active,
    role: doc.role || "Driver",
    phone: doc.phone || "",
    vanRegistration: doc.vanRegistration || ""
  };
}

export interface DriverProfileInput {
  email: string;
  initials: string;
  fullName: string;
  phone: string;
  vanRegistration: string;
  role: string;
  active: boolean;
}

/**
 * Creates or edits a driver's profile fields -- the /admin Drivers screen's Add/Edit
 * form. Deliberately separate from setDriverPassword: editing a phone number must
 * never touch the password or force a re-login.
 */
export async function upsertDriverProfile(input: DriverProfileInput): Promise<void> {
  const email = normalizeEmail(input.email);
  const initials = input.initials.trim().toUpperCase();
  const now = new Date();
  const col = await driverAccounts();
  const existing = await col.findOne({ email });
  const wasActive = existing?.active ?? true;

  const update: Parameters<typeof col.updateOne>[1] = {
    $set: {
      email,
      initials,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      vanRegistration: input.vanRegistration.trim(),
      role: input.role.trim() || "Driver",
      active: input.active,
      updatedAt: now
    },
    $setOnInsert: { passwordHash: "", createdAt: now, lastLoginAt: null, tokenVersion: 0 }
  };
  // Newly deactivating an account kills its existing sessions, same as
  // deactivateDriverAccount below -- a driver removed from the roster shouldn't stay
  // logged in on their phone.
  if (wasActive && !input.active) update.$inc = { tokenVersion: 1 };

  await col.updateOne({ email }, update, { upsert: true });
}

/** All driver accounts, roster + login status combined -- the /admin Drivers list. */
export async function listDriverProfiles(): Promise<
  Array<DriverProfile & { hasPassword: boolean; lastLoginAt: Date | null }>
> {
  const col = await driverAccounts();
  const docs = await col.find({}).sort({ fullName: 1 }).toArray();
  return docs.map(doc => ({
    ...toDriverProfile(doc),
    hasPassword: Boolean(doc.passwordHash),
    lastLoginAt: doc.lastLoginAt
  }));
}

/** Matches by email or initials -- mirrors the old Sheets getDriver()'s email-or-
 * identifier lookup. In practice tmv-pwa identifies drivers by email (session cookie),
 * so this is almost always an email match. */
export async function getDriverProfile(identifier: string): Promise<DriverProfile | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;
  const col = await driverAccounts();
  const doc = await col.findOne({
    $or: [{ email: normalized.toLowerCase() }, { initials: normalized.toUpperCase() }]
  });
  return doc ? toDriverProfile(doc) : null;
}

export async function getDriverProfileByInitials(initials: string): Promise<DriverProfile | null> {
  const col = await driverAccounts();
  const doc = await col.findOne({ initials: initials.trim().toUpperCase() });
  return doc ? toDriverProfile(doc) : null;
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
  // A profile created via the /admin Drivers screen with no password set yet (invite
  // pending) -- bcrypt.compare() requires a real hash string, so this must short-
  // circuit rather than reject with "wrong_password" for what's actually "no password
  // set at all".
  if (!account.passwordHash) return { ok: false, reason: "not_found" };

  const matches = await bcrypt.compare(plainPassword, account.passwordHash);
  if (!matches) return { ok: false, reason: "wrong_password" };

  await col.updateOne({ email: account.email }, { $set: { lastLoginAt: new Date() } });
  return { ok: true, account };
}

export async function getDriverAccount(email: string): Promise<DriverAccountDoc | null> {
  const col = await driverAccounts();
  return col.findOne({ email: normalizeEmail(email) });
}
