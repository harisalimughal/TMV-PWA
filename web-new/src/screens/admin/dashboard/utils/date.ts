/** Ported verbatim from TMV-Chat-bot's dashboard/web/src/utils/date.ts. */
import { DateTime } from "luxon";

/** Formats an ISO string into: "19/08/26 · 16:52" */
export function formatLondonDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(iso)) {
      const parts = iso.split(/[/ :]/);
      if (parts.length >= 3) {
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        const y = parts[2];
        const dt = DateTime.fromISO(`${y}-${m}-${d}`);
        if (dt.isValid) return dt.toFormat("dd/MM/yy");
      }
      return iso;
    }

    const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/London");
    if (!dt.isValid) {
      const jsDate = new Date(iso);
      if (!isNaN(jsDate.getTime())) {
        const dt2 = DateTime.fromJSDate(jsDate).setZone("Europe/London");
        if (dt2.isValid) return dt2.toFormat("dd/MM/yy · HH:mm");
      }
      return iso;
    }
    return dt.toFormat("dd/MM/yy · HH:mm");
  } catch {
    return iso || "—";
  }
}

/** Short date: "19/08/26" */
export function formatLondonDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/London");
    if (dt.isValid) return dt.toFormat("dd/MM/yy");
    return iso;
  } catch {
    return iso || "—";
  }
}

/** Time only: "16:52" */
export function formatLondonTimeOnly(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone("Europe/London");
    if (dt.isValid) return dt.toFormat("HH:mm");
    return iso;
  } catch {
    return iso || "—";
  }
}
