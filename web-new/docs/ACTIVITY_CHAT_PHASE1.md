# Job Activity Chat: phase 1 (audit, domain model, shared contract)

Status: audit and shared definitions done in this repository. **The schema, migration and
backend services are not built, because this repository has no backend.** Everything below that
the backend must do is a specification, not shipped code.

## 0. What this repository is, and what that means for the request

`package.json` has no server, database, ORM, migration tool or WebSocket library. `CLAUDE.md`
and `docs/DRIVER_DATA.md` both say the backend (Express, MongoDB, a Google Chat bot) lives in
other repositories, and `docs/DRIVER_DATA.md` states it plainly: "This repo has no database,
schema, migrations or seed data". The repositories available to this session are this one and
three unrelated ones, so the backend could not be read or changed. Adding a server and a database
here would contradict the project's architecture and create a second, disconnected source of
truth, so it was not done.

Delivered here instead (all frontend-safe, tested, pure):

| Where | What |
| --- | --- |
| `src/lib/activity/events.ts` | The event catalogue: the confirmed driver/admin/system action to event mapping, with verification level and caveats |
| `src/lib/activity/contract.ts` | The proposed wire contract, the invariants a write must satisfy, idempotency keys, the read/send authorisation rules |
| `src/lib/activity/fromLegacy.ts` | Adapter from the existing `job.activity[]` audit trail, so a first UI can run on data that exists today |
| `src/lib/activity/activity.test.ts` | 16 tests, including checks that the catalogue matches the real client source |
| this document | Architecture findings and the backend specification |

## 1. Current architecture (verified from the code)

| Area | Finding |
| --- | --- |
| Frontend | Vite, React 18, TypeScript, Tailwind with CSS-variable tokens, React Query, Luxon (Europe/London), Vitest. One bundle, three products: driver PWA, Aurora admin, retired classic admin (not routed) |
| Admin layout | `src/screens/admin/`, left navigation of 8 destinations in `dashboard/navigation.ts`; a job opens as a centred dialog from `?job=`; filters live in the URL |
| Jobs and lifecycle | `Job.status`: READY, IN_PROGRESS, COMPLETED, CANCELLED. The driver workflow is a server-side state machine driven by `Job.currentState` (`src/screens/workflow/steps.ts`, 12 steps) |
| Drivers | Roster is `driver_accounts` in the backend (`GET /api/admin/drivers`). The stable key everywhere is the two-character **driver initials** (`driverInitials`); there is no exposed database id. A job has exactly one `driverInitials` |
| Assignment | `POST /api/admin/jobs/:id/reassign { driverInitials }` replaces that one field. Multi-driver jobs do not exist in the model (a helper name appears only in the manual summary) |
| Authentication | Cookie sessions, same origin. Admin: `tmv_admin_session`, every call through `adminFetch` (401 returns to sign-in). Driver: a separate session through `src/lib/http.ts` (401 returns to the login screen) |
| Authorisation in the frontend | The dashboard has **one admin role**. No per-admin scope exists to mirror, so "the owner's authorised scope" cannot be verified from here |
| Real-time | None. No WebSocket, EventSource or socket.io. Freshness comes from React Query polling (live fleet 10 s, attention 30 to 60 s) and, in the driver app, a 30 s job-list poll plus refresh on focus and on a push |
| Push | Web Push through `public/push-worker.js`, which writes every push to an on-device IndexedDB log and broadcasts to open tabs. Subscribe endpoints under `/api/push/*` |
| Offline | Main workflow steps are **never** queued offline (each advances the state machine). Only scenario (issue report) submissions are queued, in IndexedDB, with the original `createdAt` and each photo's capture time and place (`src/lib/outbox.ts`) |
| GPS | GPSLive via the backend: `trackerArrivalAt` (+ distance), `dropoffTracking.arrivalAt/departureAt/unverifiedReason`, `congestionZoneEnteredAt`, `tunnelZoneEnteredAt`, live positions. All are observations written by the backend |
| Existing activity | Every job already has `activity: ActivityEntry[]` = `{ timestamp, driver, action, fromState?, toState?, detail? }`. The admin Activity tab groups it by regex on the action text. **The real action strings are not documented in this repository** (the dev mock uses invented ones) |

## 2. Confirmed driver action to event mapping

Source of each row: the call in `src/screens/JobWorkflowScreen.tsx` (`sendAction` names, upload and signature
handlers), `src/components/driver/FeaturedJobCard.tsx` (on-my-way, start, viewed), `src/api/jobs.ts` and the admin
`api.ts`. The workflow state is where the server accepts it. The full machine-readable list, with caveats, is
`ACTIVITY_EVENTS`.

| Driver does | Backend operation that must succeed | Event | Chat text | Certainty |
| --- | --- | --- | --- | --- |
| Opens a job | `POST /jobs/:id/viewed` | `job.viewed` (quiet) | Driver opened the job | driver submitted |
| Taps I'm on the way | `POST /jobs/:id/on-my-way` | `driver.on_my_way` | Driver is on the way | driver submitted |
| Start Job | `POST /jobs/:id/start` | `job.started` | Driver started the job | driver submitted |
| Proof of arrival photo | `POST /jobs/:id/evidence` at `WAITING_ARRIVAL_PHOTO` | `arrival.photo_submitted` | Proof of arrival photo submitted | driver submitted (photo has its own capture time and place) |
| No issues at pickup | `ISSUES_NONE` at `WAITING_ARRIVAL_ISSUES_CHECK` | `issue.none_reported_pickup` | No issues reported at pickup | driver submitted |
| Files an issue report | `POST /jobs/:id/scenarios/:scenario` at `WAITING_*_ISSUES_CHOICE` | `issue.report_submitted` | Driver submitted an issue report | driver submitted |
| Continues after a report | `ISSUES_RESUME` | `issue.resumed` (quiet) | Driver continued after the issue report | driver submitted |
| Van loaded photo | `POST /jobs/:id/evidence` at `WAITING_LOADED_PHOTO` | `load.photo_submitted` | Van loaded photo submitted | driver submitted |
| Finish Move | `FINISH_MOVE` at `IN_PROGRESS` | `move.finished` | Driver finished the move | driver submitted |
| No issues at drop-off | `ISSUES_NONE` at `WAITING_EMPTY_VAN_ISSUES_CHECK` | `issue.none_reported_dropoff` | No issues reported at drop-off | driver submitted |
| Empty van photo | `POST /jobs/:id/evidence` at `WAITING_EMPTY_VAN_PHOTO` | `emptyvan.photo_submitted` | Empty van photo submitted | driver submitted |
| Customer signs | `POST /jobs/:id/signature` | `customer.signature_captured` | Customer signature captured | driver submitted |
| Extra charges / overtime / total | `SUBMIT_EXTRA_CHARGES`, `SUBMIT_OVERTIME`, `SUBMIT_TOTAL_CHARGES` | `charges.extra_submitted`, `charges.overtime_submitted`, `charges.total_submitted` | Extra charges / Overtime / Total charges submitted | driver submitted |
| Payment | `SUBMIT_PAYMENT` | `payment.recorded` | Payment recorded by the driver | driver-reported, not bank-confirmed |
| Manual details | `POST /jobs/:id/driver-summary` | `charges.manual_details_submitted` | Manual job details submitted | driver submitted |
| Review choice and email | `REVIEW_NONE`, `REVIEW_YES`, `SEND_REVIEW_EMAIL` | `review.declined`, `review.requested`, `review.email_sent` | Review email sent to the customer | driver submitted |
| Goes back a data-entry step | `GO_BACK` | `workflow.step_reversed` (quiet) | Driver went back a step | driver submitted |
| Job reaches COMPLETED | server state machine | `job.completed` | Job completed | system recorded |
| Admin reassigns, finishes manually, removes evidence, adds a job | admin endpoints | `assignment.reassigned`, `job.finished_manually`, `evidence.removed`, `job.created_by_admin` | titles in the catalogue | admin recorded |
| Calendar sync creates or cancels a job | sync | `job.created_from_calendar`, `job.cancelled` | Job imported from the Calendar / Job cancelled | system recorded |
| (no driver action) tracker signals | `trackerArrivalAt`, `dropoffTracking.*`, `congestionZoneEnteredAt`, `tunnelZoneEnteredAt` | `tracker.pickup_arrival_detected`, `tracker.dropoff_arrival_detected`, `tracker.dropoff_departure_detected`, `zone.congestion_detected`, `zone.tunnel_detected` | "Tracker detected the van near the pickup" etc. | **tracker observed, not confirmed** |

Differences from the examples in the brief:

- There is **no loading started, loading completed, departed from pickup, unloading started or unloading
  completed** step in this application. They are not invented. The nearest real events are the van-loaded
  photo and Finish Move, worded for what they actually are. A test fails if those phrases appear.
- "Job Delayed" is not a driver action; lateness is computed from verified arrival times. It stays an
  analytic, not an event.
- "Driver reported issue" exists, as the issue report submission (the form content is the evidence; the chat
  stores only the report type).
- GPS is kept apart: tracker events are always a system actor, `tracker_observed`, titled "detected", and
  carry a caveat saying what they do not prove. They never imply that loading, unloading or completion happened.

## 3. Notifications and broadcast: findings

Details in `docs/NOTIFICATIONS_AUDIT.md`. In short:

- **Broadcast is implemented in the frontend**, not just visible. `SendBroadcastPushModal`: audience (all active
  drivers or one), title, message, tap URL, a review step, a confirmed send. It calls
  `POST /api/push/admin/broadcast { title, body, url, driverInitials? }` and reads `result.sent` (subscribed
  devices that accepted the push). Channel: **Web Push only**, not email or SMS.
- **Unverified**: the backend's behaviour (role checks, response beyond `sent`, per-device failures, any history).
  The mock refuses all push calls, so no real send was exercised.
- A broadcast is **not stored as a conversation**, has no history and no recipient list, so it cannot be the base
  of the chat. The chat must be its own stream; a message can additionally trigger the existing push.
- The driver's notification list is an **on-device IndexedDB log** (`notificationLog.ts`). It is not on the
  server, is per browser, and is lost with the device. A driver-facing conversation therefore must come from the
  server, never from that log.
- Customer email and SMS delivery (`GET /api/admin/notifications`) is a separate, per-job delivery log. Do not
  merge it into the chat.

## 4. Domain model (specification for the backend)

### One stream, two kinds

A job has one logical conversation: the set of activity records with that `jobId`. There is **no separate
conversation document** (it would only duplicate the job). A record is either

- `kind: "operational"`: written by the server, inside the existing action handlers, after the action succeeded;
- `kind: "message"`: typed by an admin or by the assigned driver.

`activityProblems()` enforces the separation: a message must use a message type, a human sender, verification
`not_applicable` and the message category; an operational record must match its catalogue entry exactly (actor
role, source, verification, category). So a direct message can never be stored as a confirmed event, and a
driver can never be recorded as the author of a system or admin event.

### Fields (`ActivityMessage`)

`id`, `jobId`, `kind`, `type`, `category`, `actor { role, driverInitials | adminId, displayName }`, `title`,
`body?`, `occurredAt`, `recordedAt`, `source`, `verification`, `stop?`, `metadata?` (small typed facts only),
`idempotencyKey`, `notificationRef?`, `supersedes?`, `fromState?`, `toState?`.

### MongoDB collection `job_activities` (to create in the backend repository)

```js
{
  _id: ObjectId,                 // used as the cursor (monotonic per process, sortable)
  jobId: String,                 // the existing job identifier (Job.jobId); no copy of job state
  kind: "operational" | "message",
  type: String, category: String,
  actor: { role, driverInitials?, adminId?, displayName },
  title: String, body?: String,
  occurredAt: Date,              // device or source clock
  recordedAt: Date,              // server clock, authoritative for ordering
  source: "driver_app" | "admin_dashboard" | "system" | "gps_tracker" | "calendar_sync",
  verification: "driver_submitted" | "admin_recorded" | "system_recorded" | "tracker_observed" | "not_applicable",
  stop?: "pickup" | "dropoff" | "stopby",
  metadata?: Object, idempotencyKey: String,
  notificationRef?: { kind, id }, supersedes?: ObjectId,
  fromState?: String, toState?: String,
  visibleToDriver: Boolean,      // false for admin-only housekeeping ("quiet" internal events)
  schemaVersion: 1
}
```

### Indexes

| Index | Serves |
| --- | --- |
| `{ jobId: 1, idempotencyKey: 1 }` **unique** | duplicate prevention and safe retries |
| `{ jobId: 1, _id: 1 }` | one conversation in order, and `after=` cursor paging |
| `{ "actor.driverInitials": 1, _id: -1 }` | driver-specific filtering |
| `{ category: 1, _id: -1 }` | category filter in the global feed |
| `{ type: 1, _id: -1 }` | event-type filter |
| `{ _id: -1 }` | the global Activity Center, newest first |
| `{ recordedAt: -1 }` | date-range queries (the feed filters by London day boundaries converted to UTC) |

### Unread state (needed by chat, kept separate)

`activity_read_markers { jobId, readerRole, readerId, lastReadId, updatedAt }`, unique on
`{ jobId, readerRole, readerId }`. It is a pointer, so it never duplicates or edits a message.

### Append-only

No update or delete route exists. A correction is a new record with `supersedes` pointing at the old one; the
UI shows the correction and may fold the original. Admin evidence deletion stays an event
(`evidence.removed`), never a removal of the earlier upload event.

### Existing `job.activity[]`: one source of truth

The job already stores an audit trail. Do not run two writers. The backend should add one function,
`recordActivity(event)`, called **inside each existing handler, in the same operation as the state change**
(a Mongo transaction where the deployment allows it, otherwise write the activity first with its idempotency
key and make the state change idempotent too). That function writes the new collection and, until the old
field is retired, the legacy `activity[]` entry. A one-off back-fill can convert old entries with `fromLegacyActivity`
once the real action strings are known; until then they appear as "legacy" entries, never as confirmed steps.

### Times

Stored as UTC `Date`. `occurredAt` is the source's own time (a photo's capture time, the tracker's timestamp);
`recordedAt` is the server's. For the main workflow they are within the request time of each other, because those
steps cannot be queued offline. For an issue report submitted from the offline outbox, `occurredAt` is the queued
time and `recordedAt` is the replay time, so the chat can say "Submitted 14:02, received 14:31". Screens render
both in Europe/London.

## 5. Authorisation (enforced server-side; `canViewConversation` and `canSendMessage` pin the rules)

- A driver reads only conversations of jobs **currently assigned to them** (`job.driverInitials` equals the
  session's driver). After a reassignment the earlier driver loses access; history stays for admins and for the new
  driver.
- A driver can send only a direct message, and only on an assigned job. **No endpoint lets a client post an
  operational event**; they are created by the server when the real action succeeds, so a driver cannot submit an
  activity for another job or as another driver. The actor is taken from the session, never from the body.
- An admin can read any conversation today (one role). Narrowing the owner's scope needs an admin scope model in
  the backend; the contract leaves room for it (`FORBIDDEN`).
- An admin message needs an assigned driver (`NO_ASSIGNED_DRIVER`).
- Messages are plain text, at most 1000 characters; the server escapes on render and never executes content.
- Metadata and logs must not contain booking text, customer contact details or free text from issue forms.

## 6. Proposed integration contract (for the backend and the next frontend stage)

All same origin, cookie sessions, `Cache-Control: no-store`. Errors use the existing `{ error: { code, message } }`.

```
GET  /api/admin/jobs/:jobId/activity?after=<cursor>&limit=50        -> ActivityPage
GET  /api/admin/activity?jobId&driver&category&type&kind&from&to&after&limit   -> ActivityPage   (Activity Center)
POST /api/admin/jobs/:jobId/activity/messages   { clientMessageId, body }       -> 201 ActivityMessage
GET  /api/jobs/:jobId/activity?after=<cursor>&limit=50              -> ActivityPage   (driver, assigned job only)
POST /api/jobs/:jobId/activity/messages         { clientMessageId, body }       -> 201 ActivityMessage
```

- `ActivityPage = { items, nextCursor?, serverTime }`. `after` returns strictly newer items; oldest first inside a
  conversation, newest first in the global feed.
- A repeated `clientMessageId` returns the original item with `200`, never a duplicate.
- Operational events need no endpoint. For idempotency the existing action calls should accept a
  `clientRequestId` (header `X-Request-Id`), which the server turns into `requestIdempotencyKey(jobId, type, id)`;
  system-derived events use `systemIdempotencyKey(jobId, type, sourceRef)` such as the tracker field's own timestamp,
  so a retried worker cannot double-post.
- Types: `ActivityMessage`, `ActivityPage`, `ActivityQuery`, `PostDirectMessage`, `ActivityErrorCode` in
  `src/lib/activity/contract.ts`.

### Real-time: the existing stack is enough to start

No WebSocket, Redis or new database is introduced.

1. Open conversation: poll `GET ...activity?after=<cursor>` every 5 s while the tab is visible (the app already
   polls this way and refreshes on focus), backing off when hidden.
2. Activity Center: 30 s, matching the attention feed.
3. Off-screen: the existing Web Push for a new direct message (`kind: "activity_message"`, `tag: job:<id>`), which
   the existing `jobsRefresh` and in-app listener already know how to turn into an immediate refetch.
4. If sub-second delivery is ever required, Server-Sent Events on the same Express server need no new
   infrastructure beyond disabling proxy buffering for that route in the nginx config. Decide after seeing how polling feels.

## 7. Limitations and open questions

1. **No backend access** from this session; schema, migration, services, and the real action strings of `job.activity[]`
   are unverified and unbuilt. This is the main blocker.
2. The dashboard has a single admin role, so admin scoping cannot be specified beyond "any job" until the backend defines it.
3. The driver can currently never go offline mid-workflow for the main steps, so ordering conflicts are limited to issue reports.
4. Per-device broadcast results and a broadcast history do not exist.
5. There is no distinct stable driver id beyond the initials; a driver whose code changed would need a migration the backend must handle.
6. Typing indicators, read receipts per message and attachments are out of scope; read state is a pointer only.

## 8. What is needed to continue

Either add the backend repository to this session (it will be read first, then the collection, the `recordActivity`
function, the routes and a migration written to its own conventions), or hand this document to its owner. The
frontend can start on the Activity Center and the job conversation against the adapter and a mock of the contract
without waiting.

## Corrections after the UI was built

- **Display order is `occurredAt` first**, then `recordedAt`, then `id` as the tie-break. `recordedAt`
  is authoritative for when the server learned of something, and `id` is the cursor order (polling and
  recovery), but a step a phone recorded offline must sit where it happened in the conversation, and the
  entry says "received later" when the gap is over two minutes. `src/lib/activity/model.ts`
  (`compareActivity`) is the single implementation.
- Contract additions the UI needed (all in `contract.ts`): conversation list shape and query,
  `olderCursor` and `before` paging, per-conversation `capabilities` decided by the server, the unread
  summary, mark-read request, the `DRIVER_CHANGED` error (a message is refused when the job was reassigned
  after the composer opened), and `delivery` / `readAt` on a message, present only when the server really
  tracks them.
