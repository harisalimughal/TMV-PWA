import { google, calendar_v3 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { withRetry } from "../utils/retry";

let clientPromise: Promise<calendar_v3.Calendar> | null = null;

async function client(): Promise<calendar_v3.Calendar> {
  if (!clientPromise) {
    clientPromise = createGoogleAuth(SCOPES.CALENDAR)
      .then(auth => google.calendar({ version: "v3", auth }))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

/**
 * Google Calendar's sharing UI won't grant "Make changes" to a service account at
 * all — confirmed live, it's a hard platform restriction on non-human identities, not
 * an org-policy setting. Domain-wide delegation sidesteps it entirely: the service
 * account impersonates a real Workspace user (GOOGLE_WORKSPACE_IMPERSONATED_USER, the
 * same env var already used for Gmail) who has ordinary edit access to the calendar,
 * so this is a separate client from the read path above, which keeps working exactly
 * as it already does.
 */
let writeClientPromise: Promise<calendar_v3.Calendar> | null = null;

async function writeClient(): Promise<calendar_v3.Calendar> {
  if (!env.impersonatedUser) {
    throw new Error(
      "GOOGLE_WORKSPACE_IMPERSONATED_USER must be set to create Calendar events. Calendar " +
        "won't grant a service account write access directly, so event creation impersonates " +
        "this user via domain-wide delegation instead — see google/calendar.ts."
    );
  }
  if (!writeClientPromise) {
    writeClientPromise = createGoogleAuth(SCOPES.CALENDAR, { impersonate: true })
      .then(auth => google.calendar({ version: "v3", auth }))
      .catch(error => {
        writeClientPromise = null;
        throw error;
      });
  }
  return writeClientPromise;
}

export interface ListEventsOptions {
  /** Include cancelled events so the sync can reconcile deletions (§P1-5). */
  showDeleted?: boolean;
}

export async function listCalendarEvents(
  timeMin: string,
  timeMax: string,
  options: ListEventsOptions = {}
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = await client();
  const response = await withRetry("calendar.events.list", () =>
    calendar.events.list({
      calendarId: env.calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: options.showDeleted ?? false,
      orderBy: "startTime",
      maxResults: 250
    })
  );
  return response.data.items ?? [];
}

export async function getCalendarEvent(eventId: string): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await client();
  const response = await withRetry("calendar.events.get", () =>
    calendar.events.get({ calendarId: env.calendarId, eventId })
  );
  return response.data ?? null;
}

/**
 * Used by the admin panel's "Add Job" form. Jobs are never written straight into the
 * Bookings sheet — the calendar sync reconciles anything not present in Calendar as
 * cancelled (see booking.service.ts's reconcileDisappeared), so an admin-created job
 * has to come in as a real event and flow through the same parse/sync path as every
 * other booking.
 */
export async function createCalendarEvent(event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event> {
  const calendar = await writeClient();
  const response = await withRetry("calendar.events.insert", () =>
    calendar.events.insert({ calendarId: env.calendarId, requestBody: event })
  );
  return response.data;
}
