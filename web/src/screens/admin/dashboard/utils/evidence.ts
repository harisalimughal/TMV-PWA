/**
 * Evidence-count helpers for scenario submissions (parking liability, storage, etc.).
 *
 * Evidence counts must never be fabricated -- they are audit-facing. When the payload
 * genuinely doesn't tell us how many photos a submission has, the answer is "unknown"
 * (null), not a guess.
 */

/**
 * The number of evidence photos attached to a scenario submission, or `null` when the
 * record carries no photos array at all.
 *
 * A present-but-empty array is a truthful zero: the API contract for a scenario item
 * (`ScenarioItem.photos` in ../types) always includes the array when the server knows
 * the answer, so `[]` means "no photos", whereas a missing field means "not recorded".
 */
export function evidencePhotoCount(item: unknown): number | null {
  const fromArray = (value: unknown): number | null => (Array.isArray(value) ? value.length : null);

  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;

  const direct = fromArray(record.photos);
  if (direct !== null) return direct;

  const raw = record.rawRecord;
  if (raw && typeof raw === "object") {
    return fromArray((raw as Record<string, unknown>).photos);
  }
  return null;
}
