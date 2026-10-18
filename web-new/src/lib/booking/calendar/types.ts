/**
 * Google Calendar mirror: types shared by the formatter, the sync engine and the preview. TMV is the source of
 * truth; the calendar is a one-way, secondary copy. Nothing here reads a calendar change back into a booking.
 */
import type { Iso } from "../types";

export type AddressDetail = "full" | "postcode" | "none";
export type EventFormat = "private" | "compatible";
export type CancellationMode = "mark_cancelled" | "delete";

export interface CalendarConfig {
  /** The automatic synchronisation switch. Off means no task is processed (tasks still queue). */
  enabled: boolean;
  calendarId: string | null;
  /** Mirror enquiries as tentative events. Off by default: only confirmed bookings are mirrored. */
  syncUnconfirmed: boolean;
  cancellation: CancellationMode;
  format: EventFormat;
  include: {
    customerName: boolean; customerPhone: boolean; customerEmail: boolean;
    addresses: AddressDetail; inventory: boolean; notes: boolean; driver: boolean; vehicle: boolean; bookingLink: boolean;
    /** Only used by the "compatible" format, which the legacy sync reads. Needs a known price. */
    price: boolean;
  };
  /** Base URL used to build the link back to the TMV booking. */
  appBaseUrl: string;
}

/** Conservative defaults: the calendar may be shared more widely than the dashboard. */
export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  enabled: false, calendarId: null, syncUnconfirmed: false, cancellation: "mark_cancelled", format: "private",
  include: { customerName: true, customerPhone: false, customerEmail: false, addresses: "postcode", inventory: false, notes: false, driver: true, vehicle: true, bookingLink: true, price: false },
  appBaseUrl: ""
};

export interface CalendarEventPayload {
  /** Deterministic id derived from the booking id, so creating twice cannot make two events. */
  id: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime: Iso; timeZone: "Europe/London" };
  end: { dateTime: Iso; timeZone: "Europe/London" };
  /** "opaque" blocks time; cancelled events are "transparent" so they stop blocking the calendar. */
  transparency: "opaque" | "transparent";
  /** Google's own `status`. TMV never sets "cancelled" (that is Google's deleted state). */
  status: "confirmed" | "tentative";
  extendedProperties: { private: { tmvBookingId: string; tmvFingerprint: string; tmvFormat: EventFormat } };
}

export type SyncStatus = "pending" | "synced" | "failed" | "blocked" | "skipped";

/** The stable link between one booking and one calendar event. */
export interface EventMapping {
  bookingId: string;
  calendarId: string | null;
  eventId: string | null;
  fingerprint: string | null;
  /** Booking version the last successful write was built from. Older runs never overwrite newer ones. */
  syncedVersion: number;
  status: SyncStatus;
  attempts: number;
  nextAttemptAt: Iso | null;
  lastError: { kind: ErrorKind; message: string; at: Iso } | null;
  lastSyncedAt: Iso | null;
  /** True once the event was removed or hidden for a cancellation, so repeats are no-ops. */
  cancelledApplied: boolean;
}

export type ErrorKind = "auth" | "rate_limited" | "transient" | "permanent" | "blocked";

export type SyncDecision =
  | { action: "create" | "update" | "cancel" | "delete" }
  | { action: "noop"; reason: string }
  | { action: "skip"; reason: string };

export interface CalendarEventSummary { id: string; calendarId: string; summary: string; start: Iso; end: Iso; location: string; description: string; private: Record<string, string> }
