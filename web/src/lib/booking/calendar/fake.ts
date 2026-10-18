/**
 * In-memory Google Calendar stand-in for tests and the preview. It behaves like the parts of the API the engine
 * relies on: client-chosen ids (409 on a repeat), a deleted id stays reserved, patching a missing event is a 404,
 * and failures can be queued to simulate outages, expired sign-ins and rate limits. It is clearly not Google.
 */
import { CalendarApiError, type CalendarClient } from "./engine";
import type { CalendarEventPayload, CalendarEventSummary } from "./types";

export class FakeCalendar implements CalendarClient {
  events = new Map<string, CalendarEventPayload & { calendarId: string }>();
  deleted = new Set<string>();
  calls = { insert: 0, patch: 0, remove: 0, list: 0 };
  private failures: unknown[] = [];

  failNext(...errors: unknown[]) { this.failures.push(...errors); }
  private maybeFail() { const next = this.failures.shift(); if (next) throw next; }

  async insert(calendarId: string, event: CalendarEventPayload) {
    this.calls.insert++; this.maybeFail();
    if (this.events.has(event.id) || this.deleted.has(event.id)) throw new CalendarApiError(409, "duplicate");
    this.events.set(event.id, { ...event, calendarId });
    return { id: event.id };
  }
  async patch(calendarId: string, eventId: string, event: Partial<CalendarEventPayload>) {
    this.calls.patch++; this.maybeFail();
    const current = this.events.get(eventId);
    if (!current && !this.deleted.has(eventId)) throw new CalendarApiError(404, "notFound");
    this.deleted.delete(eventId);
    this.events.set(eventId, { ...(current ?? ({} as CalendarEventPayload & { calendarId: string })), ...event, id: eventId, calendarId } as CalendarEventPayload & { calendarId: string });
  }
  async remove(_calendarId: string, eventId: string) {
    this.calls.remove++; this.maybeFail();
    if (!this.events.has(eventId)) throw new CalendarApiError(404, "notFound");
    this.events.delete(eventId); this.deleted.add(eventId);
  }
  async list(calendarId: string, from: string, to: string): Promise<CalendarEventSummary[]> {
    this.calls.list++; this.maybeFail();
    return this.snapshot(calendarId, from, to);
  }
  /** Synchronous read of the same data, for the preview's read-only reconciliation report. */
  snapshot(calendarId: string, from: string, to: string): CalendarEventSummary[] {
    return [...this.events.values()].filter(e => e.calendarId === calendarId && Date.parse(e.start.dateTime) < Date.parse(to) && Date.parse(e.end.dateTime) > Date.parse(from))
      .map(e => ({ id: e.id, calendarId, summary: e.summary, start: e.start.dateTime, end: e.end.dateTime, location: e.location, description: e.description, private: { ...(e.extendedProperties?.private ?? {}) } }));
  }
  /** Simulates someone editing or adding an event directly in Google Calendar. */
  external(event: Partial<CalendarEventPayload> & { id: string; calendarId: string }) { this.events.set(event.id, { ...(this.events.get(event.id) ?? ({} as CalendarEventPayload)), ...event } as CalendarEventPayload & { calendarId: string }); }
}

export class MemoryMappings {
  data = new Map<string, import("./types").EventMapping>();
  async get(id: string) { const m = this.data.get(id); return m ? { ...m } : null; }
  async save(mapping: import("./types").EventMapping) { this.data.set(mapping.bookingId, { ...mapping }); }
}
