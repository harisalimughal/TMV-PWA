# Google Calendar integration (TMV to Calendar, one way)

TMV is the source of truth. Google Calendar is a secondary copy written from confirmed bookings. Nothing is read
back from the calendar, and no two-way sync is built or proposed without explicit approval.

## Status in one paragraph

**Built and tested here:** the event formatter with privacy controls, the idempotent sync engine (create, update,
cancel, delete, retries, auth pause, per-booking serialisation, version guard), read-only reconciliation, a fake
calendar for tests, a simulated preview, the contract routes and the Settings, Integrations, Google Calendar screen.
**Not built, because it cannot live in this repository:** the Google OAuth flow, encrypted token storage, the durable
queue and worker that call the Google API, and any real connection. This repo is the dashboard front end only. The
backend (Express and MongoDB) is a separate repository. Nothing has been connected to a real Google account,
nothing has been deployed, and the existing integrations are untouched.

## Phase 1: audit of what exists

Found in this repository (comments and types only; the code that does the work is in the backend repo):

- Jobs carry `calendarEventId`, `rawTitle` and `rawDescription`. The existing backend **reads** Calendar events and
  turns them into Jobs (`backend/src/jobs/booking.service.ts`, referenced but not present here).
- Title convention, from comments: `"<crew> Men - £<price> - <HH:mm> / <Y|N> - <initials>"`. The backend never syncs an
  event tagged `/ N` or untagged. An `INV` tag after the `/` marks an invoice job.
- Description convention: labelled lines (`Pick up address:`, `Drop off:`, `Name:`, `Email Address:`, `Phone Number:`,
  `Move Date:`, `Van Size:`, `Duration of Van Hire:`, `Number of helpers:`, `Extra request:`, `Floor From and To:`,
  `Inventory item:`). Google's editor may save `<br>` and `<div>`, which `htmlToPlainText` normalises.
- Driver initials are the assignment key: the last segment of the title.
- `POST /api/admin/jobs` creates a real Calendar event server-side; the dashboard never calls Google.
- The booking extension, the Make.com scenarios and the sync scripts are **not in this repository**. Their exact
  behaviour is unknown and must be captured before any cut-over (see Migration protection).

Reusable: the title and description conventions (as the optional "compatible" format), `htmlToPlainText`, and the
`calendarEventId` join. Not reusable: anything that writes to Google, which does not exist here.

## Why privacy is the default

The existing title carries the **price** and the description carries **email and phone**. Anyone with access to that
calendar sees them. The default format here is `TMV-2044 · Large van · AR` with the customer name, postcodes only
(no street address), no phone, email, inventory, notes or price, and a link to the TMV booking page (which needs a TMV
sign-in). Each item can be switched on in Settings. The "compatible" format reproduces the legacy title for use during
migration only; it refuses to write without a known price rather than invent one, and is **unverified against the real
parser**.

## Behaviour (implemented in `src/lib/booking/calendar`)

| Rule | How |
| --- | --- |
| Only confirmed bookings | Eligible: confirmed and completed. Pending-payment bookings only if "tentative" is switched on. Enquiries never. |
| No duplicates | Event id is derived from the booking id. Creating twice returns 409, which is treated as "already there" and becomes an update. Also covers a crash between "Google created it" and "we saved the id". |
| Updates | Date, time, locations, requirements, driver, van and status all rebuild the event; a fingerprint skips writes when nothing changed. |
| Cancellation | Configurable: mark as cancelled (title `CANCELLED: ...`, event stops blocking time) or delete. Repeats are no-ops. Re-confirming a deleted booking revives the same id. The TMV audit history is separate and untouched. |
| Calendar failure never corrupts a booking | The engine writes only the mapping record, never the booking. |
| Retry-safe | Transient and rate-limit errors back off (1 min doubling to 1 h), up to 8 attempts, then `failed` and visible. Permanent refusals fail at once. |
| Expired sign-in | A 401 or `invalid_grant` pauses the integration (status "Needs reconnecting"). It does not burn retries; work waits and resumes after reconnecting. |
| Concurrency | Runs for one booking are serialised; a run never overwrites a newer synced version. |
| Reconciliation | Read-only report: missing, drifted, duplicate and orphan events, plus "possible legacy event" (unmarked event overlapping a booking that mentions its reference or postcode). It never deletes or edits. |

## What the backend must provide

1. **OAuth 2.0 authorisation-code flow, server side.** `POST /api/admin/integrations/google-calendar/connect` returns
   `{ authUrl }`; the browser goes there; Google redirects to a server callback that checks `state` (bound to the admin
   session, single use) and uses PKCE; the server exchanges the code and redirects back to Settings. The browser never
   sees a token.
2. **Scopes, minimum:** `calendar.events` (create and edit events) and `calendar.calendarlist.readonly` (list calendars
   so one can be chosen). Request offline access to obtain a refresh token. Confirm the scope names against Google's
   current documentation when configuring the consent screen; this repo cannot check them.
3. **Credential storage:** refresh token encrypted at rest with a key held outside the database (KMS or an environment
   secret), never logged, never returned by any API. Disconnect revokes the token at Google and deletes it.
4. **Authorisation:** only admins, with the existing admin session; connect, disconnect and settings changes go in the
   audit log.
5. **Durable queue and worker.** Confirm, assign, move and cancel write the booking and an outbox row in one
   transaction; a worker reads the outbox and runs `syncBooking`. The engine is plain TypeScript with injected
   dependencies, so the worker supplies a Mongo mapping store, a real Google client (`insert`, `patch`, `remove`,
   `list`) and a per-booking lock. Token refresh happens inside the Google client; a failed refresh is an `auth` error.
6. **Mapping collection** (`bookingId`, `calendarId`, `eventId`, `fingerprint`, `syncedVersion`, `status`, `attempts`,
   `nextAttemptAt`, `lastError`, `lastSyncedAt`) with a unique index on `bookingId`.
7. **Routes** (proposed, matching the preview): `GET|PUT /api/admin/integrations/google-calendar`, `POST .../connect`,
   `POST .../disconnect`, `GET .../operations`, `POST .../operations/:bookingId/retry`, `GET .../reconcile`.
8. **Rate limits and quotas:** the worker should cap concurrency and honour `Retry-After`; the engine already backs off.

## Migration protection (old and new must not both write)

The existing flow writes events that the backend turns into Jobs. A second writer into the **same calendar** could create
a second event for the same move, and a mirrored event in the legacy shape could even create a second Job. Therefore:

1. **Default to a separate calendar.** Point the integration at a new "TMV Bookings" calendar. The existing sync does
   not read it, so nothing can be duplicated or turned into a Job. Settings says this on screen.
2. **Compatible format stays off** until the real parser, a sample of real events and the extension's behaviour have been
   reviewed and tested by someone with the backend, in a non-production calendar.
3. **Markers.** Every event carries `tmvBookingId` as a private extended property. Reconciliation lists unmarked events that
   look like the same job ("possible legacy event") for a person to decide; nothing is auto-merged or deleted.
4. **Do not disable** the Make.com scenarios, the extension or the Calendar-to-backend sync until: reconciliation has run
   clean for an agreed period, the compatible-format test has passed, rollback has been rehearsed and the owner has
   approved in writing. This work does not do that.
5. **Kill switch:** the Settings toggle stops all writes at once. Existing events are left as they are.

## Test evidence (Phase 10)

`src/lib/booking/calendar/engine.test.ts` (27 tests), `preview/calendar.test.ts` (7) and the Settings screen tests (5):

new booking creation; updates for time, driver, location, requirements and status; driver reassignment; rescheduling;
cancellation (mark and delete, repeated, never mirrored, revived); duplicate and simultaneous requests (6 at once give one
event); crash after create; Google API failures (500, 400, repeated outage, 429 and `userRateLimitExceeded`); expired
credentials (pause, then resume); network failure; concurrent and stale updates; reconciliation of missing, drifted,
duplicate, orphan and legacy events; privacy defaults and opt-ins; compatible format blocked without a price.

Not tested, because they need things this repository does not have: real Google API behaviour and quotas, real OAuth and
token refresh, a real queue under load, the real legacy parser and extension.

## Screen (Settings, Integrations, Google Calendar)

Connection (connect, disconnect, reconnect), calendar choice, automatic-sync switch, tentative option, format and privacy
options, cancellation handling, health counts, last successful write, next retry, latest problem, a list of waiting or
failed operations with Retry, and a plain statement that the existing flow is unchanged. Without a server it shows
"not available on this server yet" and an explicit sample-data preview with a **simulated** connection. Screenshots:
`docs/booking-os/screenshots/gcal-*.png`. Axe (WCAG 2.2 AA, automated): no violations in light, dark and at 390 px.

## Blockers and decisions needed

- Backend work above (OAuth, token vault, queue and worker, mapping collection, routes, audit).
- A Google Cloud project, consent screen and verification for the chosen scopes.
- Which calendar to write to, and who may see it (this decides the privacy options).
- Samples of real events and the legacy parser, to test the compatible format.
- Approval of the cancellation default and of the migration plan.
