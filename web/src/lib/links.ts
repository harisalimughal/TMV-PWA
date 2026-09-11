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

/** Turn-by-turn directions from one address to another, opened in Google Maps
 *  (Android / browser) or Apple Maps (iOS offers the hand-off). Origin and
 *  destination land pre-filled so the driver just taps Start. */
export function directionsUrl(origin: string, destination: string, via?: string): string {
  const params = new URLSearchParams({ api: "1", travelmode: "driving" });
  if (origin) params.set("origin", origin);
  if (destination) params.set("destination", destination);
  if (via && via.trim()) params.set("waypoints", via.trim());
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function smsUrl(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailtoUrl(email: string): string {
  return `mailto:${email.trim()}`;
}
