/**
 * Builds the calendar event for a booking, with the privacy options applied. Pure: no clock, no network.
 *
 * Two formats:
 *  - "private" (default): "TMV-2044 · Large van · AR". No price, no contact details unless switched on.
 *  - "compatible": the shape the existing backend sync parses today ("<crew> Men - £<price> - <HH:mm> / <Y|N> -
 *    <initials>", from the comments in this repo), for use only during migration. It cannot be produced without a
 *    known price, because inventing one would put a wrong number into the legacy pipeline. The real parser is not in
 *    this repository, so compatible mode is unverified until tested against it.
 */
import { DISPLAY_LABEL, displayStatus } from "../states";
import { londonDay, londonTime } from "../schedule";
import type { Booking } from "../types";
import type { CalendarConfig, CalendarEventPayload } from "./types";

/** Google event ids: 5 to 1024 chars of a-v and 0-9. Hex of the booking id keeps it stable and valid. */
export function eventIdFor(bookingId: string): string {
  let hex = "";
  for (let i = 0; i < bookingId.length; i++) hex += bookingId.charCodeAt(i).toString(16).padStart(2, "0");
  return `tmv${hex}`.toLowerCase();
}

/** Small deterministic hash (cyrb53) for change detection. Not a security measure. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export const bookingLink = (config: Pick<CalendarConfig, "appBaseUrl">, bookingId: string) =>
  `${config.appBaseUrl.replace(/\/$/, "")}/admin?section=bookings&view=bookings&booking=${encodeURIComponent(bookingId)}`;

const place = (address: { line: string; postcode: string }, detail: CalendarConfig["include"]["addresses"]): string | null =>
  detail === "none" ? null : detail === "postcode" ? address.postcode || null : [address.line, address.postcode].filter(Boolean).join(", ") || null;

export type FormatBlock = { blocked: true; reason: string } | { blocked: false; event: CalendarEventPayload };

/** `cancelled` is passed by the planner so the same function renders the "marked as cancelled" form. */
export function buildCalendarEvent(booking: Booking, config: CalendarConfig, options: { cancelled?: boolean; tentative?: boolean } = {}): FormatBlock {
  const inc = config.include;
  const cancelled = options.cancelled ?? booking.status === "cancelled";
  const initials = booking.assignment?.status === "confirmed" ? booking.assignment.driverInitials : null;

  let summary: string;
  if (config.format === "compatible") {
    const price = booking.quotation && booking.payments.agreedPence !== null ? booking.payments.agreedPence : null;
    if (price === null) return { blocked: true, reason: "The compatible (legacy) format needs a known agreed price, and this booking has none. Nothing was written." };
    if (booking.requirements.helpers === null) return { blocked: true, reason: "The compatible (legacy) format needs the number of helpers, and this booking has none." };
    const pounds = price % 100 === 0 ? String(price / 100) : (price / 100).toFixed(2);
    summary = `${booking.requirements.helpers} Men - £${pounds} - ${londonTime(booking.start)} / ${options.tentative ? "N" : "Y"} - ${initials ?? "TBC"}`;
  } else {
    summary = [booking.reference, booking.requirements.vanType ?? "Move", initials ?? "Unassigned"].join(" · ");
  }
  if (cancelled) summary = `CANCELLED: ${summary}`;
  else if (options.tentative && config.format === "private") summary = `TENTATIVE: ${summary}`;

  const lines: string[] = [];
  lines.push(`Booking: ${booking.reference}`);
  lines.push(`Status: ${cancelled ? "Cancelled" : DISPLAY_LABEL[displayStatus(booking)]}`);
  lines.push(`When: ${londonDay(booking.start)} ${londonTime(booking.start)} to ${londonTime(booking.end)} (London)`);
  const pickup = place(booking.pickup, inc.addresses), dropoff = place(booking.dropoff, inc.addresses);
  if (pickup) lines.push(`Pickup: ${pickup}`);
  if (dropoff) lines.push(`Destination: ${dropoff}`);
  const r = booking.requirements;
  if (r.vanType) lines.push(`Van: ${r.vanType}`);
  if (r.helpers !== null) lines.push(`Helpers: ${r.helpers}`);
  if (r.estimatedHours !== null) lines.push(`Estimated duration: ${r.estimatedHours} h`);
  if (inc.customerName) lines.push(`Customer: ${booking.customer.name}`);
  if (inc.customerPhone && booking.customer.phone) lines.push(`Phone: ${booking.customer.phone}`);
  if (inc.customerEmail && booking.customer.email) lines.push(`Email: ${booking.customer.email}`);
  if (inc.driver) lines.push(`Driver: ${booking.assignment?.status === "confirmed" ? `${booking.assignment.driverName} (${booking.assignment.driverInitials})` : "Not assigned"}`);
  if (inc.vehicle && booking.assignment?.vehicle) lines.push(`Van registration: ${booking.assignment.vehicle.registration}`);
  if (inc.inventory && r.inventory) lines.push(`Inventory:\n${r.inventory}`);
  if (inc.notes && r.notes) lines.push(`Notes: ${r.notes}`);
  if (inc.bookingLink && config.appBaseUrl) lines.push(`Details: ${bookingLink(config, booking.id)}`);
  lines.push("", "Managed by TMV. Edit the booking in TMV, not here: changes made in this calendar are not read back and will be overwritten.");

  const payload: Omit<CalendarEventPayload, "extendedProperties"> = {
    id: eventIdFor(booking.id), summary, description: lines.join("\n"), location: dropoff && pickup ? pickup : pickup ?? "",
    start: { dateTime: booking.start, timeZone: "Europe/London" }, end: { dateTime: booking.end, timeZone: "Europe/London" },
    transparency: cancelled ? "transparent" : "opaque", status: options.tentative ? "tentative" : "confirmed"
  };
  return { blocked: false, event: { ...payload, extendedProperties: { private: { tmvBookingId: booking.id, tmvFingerprint: fingerprint(payload), tmvFormat: config.format } } } };
}
