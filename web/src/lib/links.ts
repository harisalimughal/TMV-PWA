/**
 * Deep links out of the app.
 *
 * Addresses and phone numbers were previously plain text, so the driver's next action
 * after reading one -- open maps, or ring the customer -- meant copying it by hand
 * into another app while standing next to a van.
 */

/** Universal maps link. Google Maps handles this on Android and in the browser, and
 *  iOS offers to open Apple Maps, so one URL covers both without sniffing platforms. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function smsUrl(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}`;
}
