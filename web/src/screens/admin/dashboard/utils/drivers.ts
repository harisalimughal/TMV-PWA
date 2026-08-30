/**
 * Rebuilt, not ported: the source's utils/drivers.ts kept a hardcoded roster (real
 * people's names/emails/phone numbers) as a localStorage-backed fallback for name/
 * color resolution. Every call site here passes an already-server-resolved
 * driverName/driverInitials (from tmv-pwa's own normalizeMongoDataset(), which joins
 * against the real driver_accounts collection) -- there's nothing left to "resolve"
 * against a second, hardcoded roster, so this is just the cosmetic formatting pieces
 * (avatar color, van reg spacing) with no fixture data baked in.
 */

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-indigo-100 text-indigo-700",
  "bg-cyan-100 text-cyan-700"
];

/** Deterministic per-code, not random per render. */
export function getAvatarColor(code: string): string {
  if (!code || code === "UN") return "bg-surface border border-line text-muted";
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

/**
 * `initials` is the driver's real assigned code (job.driverInitials, e.g. "HE") and
 * should always be passed when the caller has it -- it's the only value that's stable
 * across a driver's full name changing. The `name.substring(0, 2)` fallback below is
 * only a last resort for callers that truly have nothing but a free-text string (e.g.
 * ParkingLiabilityPage's scenario-submission rows, which don't carry a separate
 * initials field), and produces a cosmetic guess, not a real code -- passing `raw` as
 * a full display name (as JobsPage/FinishedJobsPage used to) silently mangled it into
 * the wrong badge (e.g. "Man VAN Driver" -> "MA" instead of the real "HE").
 */
export function resolveDriver(raw: string | undefined | null, initials?: string | null): {
  name: string; code: string; vehicleReg?: string; needsReassignment: boolean; color: string;
} {
  if (!raw || raw === "N/A" || raw === "undefined" || raw === "Unassigned") {
    return { name: "Unassigned", code: "UN", needsReassignment: false, color: getAvatarColor("UN") };
  }
  const name = String(raw).trim();
  const code = (initials?.trim().toUpperCase()) || name.substring(0, 2).toUpperCase() || "?";
  return { name, code, needsReassignment: false, color: getAvatarColor(code) };
}

export function formatVanReg(reg: string): string {
  if (!reg) return "";
  const clean = reg.replace(/\s+/g, "").toUpperCase();
  if (clean.length === 7) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  return reg.toUpperCase();
}
