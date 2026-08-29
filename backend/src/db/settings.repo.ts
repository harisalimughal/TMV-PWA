import { settingsCollection } from "./mongo";

/**
 * Admin-editable operational text/values -- replaces the old Sheets "Settings" tab
 * (see google/sheets.ts's now-deleted getSetting()). Falls back to the caller-supplied
 * default until an admin sets a row for that key via the /admin Settings screen, so an
 * empty settings collection never breaks anything.
 */
export async function getSetting(key: string, fallback: string): Promise<string> {
  const col = await settingsCollection();
  const doc = await col.findOne({ key });
  const value = doc?.value?.trim();
  return value || fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const col = await settingsCollection();
  await col.updateOne({ key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
}

/** All stored overrides, keyed by setting key. Keys with no stored row are simply
 * absent -- callers fall back to their own default (see admin/settings-spec.ts). */
export async function listSettings(): Promise<Record<string, string>> {
  const col = await settingsCollection();
  const docs = await col.find({}).toArray();
  return Object.fromEntries(docs.map(d => [d.key, d.value]));
}
