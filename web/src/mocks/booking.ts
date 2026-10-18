/**
 * Dev and demo only: answers the Booking OS endpoints from the in-memory preview server (fictional data), through
 * the same route table the live client calls. Production builds exclude this file (see install.ts).
 */
import { handleBookingRoute } from "../lib/booking/routes";
import { getPreviewServer } from "../lib/booking/preview/instance";
import type { MockResponse } from "./handlers";

export function handleBooking(method: string, path: string, search: string, bodyText?: string): MockResponse | null {
  return handleBookingRoute(getPreviewServer(), method, path, search, bodyText);
}
