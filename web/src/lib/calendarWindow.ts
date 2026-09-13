const LONDON = "Europe/London";

function timeOfDay(d: Date): { hm: string; period: "am" | "pm" } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LONDON
  }).formatToParts(d);
  const hour = parts.find(p => p.type === "hour")?.value ?? "";
  const minute = parts.find(p => p.type === "minute")?.value ?? "00";
  const period = (parts.find(p => p.type === "dayPeriod")?.value ?? "").toLowerCase().startsWith("p") ? "pm" : "am";
  return { hm: `${hour}:${minute}`, period };
}

/** "Friday, September 11 · 4:00 – 9:00pm" -- read the same way Calendar's own event
 *  popup reads it, so wherever this shows alongside the raw booking text feels like
 *  the same event the office sees, not a re-derived summary. Drops the start time's
 *  am/pm when it matches the end's, exactly like Calendar does. */
export function formatCalendarWindow(bookedStart: string, bookedFinish: string): string {
  const start = bookedStart ? new Date(bookedStart) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: LONDON
  }).format(start);
  const startT = timeOfDay(start);
  const finish = bookedFinish ? new Date(bookedFinish) : null;
  if (!finish || Number.isNaN(finish.getTime())) return `${datePart} · ${startT.hm}${startT.period}`;
  const finishT = timeOfDay(finish);
  const startLabel = startT.period === finishT.period ? startT.hm : `${startT.hm}${startT.period}`;
  return `${datePart} · ${startLabel} – ${finishT.hm}${finishT.period}`;
}
