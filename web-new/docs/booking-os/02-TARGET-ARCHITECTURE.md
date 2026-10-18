# Booking OS 02: target architecture

Proposed, to be confirmed against the backend before any stage that depends on it. Nothing here claims a backend
behaviour exists. Entities, states and endpoints follow patterns already verified in the repository (see
`01-EXISTING-SYSTEM.md`): `{items, pagination}` lists, `{error:{message}}` errors, `adminFetch`, URL-state filters,
pence for money, London time for days.

## 1. Entity map against existing models

| Proposed | Existing counterpart | Decision | Notes |
| --- | --- | --- | --- |
| Customer | Only `customerName/Email/Phone` copied onto each Job | **New** | De-duplication by verified email or phone, never by name or postcode alone. Jobs keep their copies (history must not change when a customer is edited). |
| Enquiry | none (the website form feeds Make.com) | **New** | Keeps the raw submission verbatim next to the normalised copy. |
| Quotation | Job `basePrice`, `rawTitle` carry a price; no quote record | **New** | One per enquiry per version chain. |
| Quotation Version | none | **New** | Immutable snapshot: inputs, rule version, line items, totals, author, reason. |
| Booking | Job already holds the booking attributes as text, joined to Calendar by `calendarEventId` | **New entity that owns the commercial truth**; Job gains `bookingId` | During migration a Booking maps to exactly one Calendar event and one Job. |
| Booking Stop | Job `stopBy` (text) | **Extend**, then **New** `stops[]` | Only if multi-stop is approved (open question). |
| Moving Inventory | Job `inventory` (text) | **Extend** with structured items beside the text | Free text stays as the customer's words. |
| Booking Extras | Job `extraRequest`, `extraChargeText`, extra charges on jobs | **Extend** | Priced extras are quote lines; operational extra charges (congestion, tunnel, overtime) stay on the Job. |
| Pricing Rules | Settings keys (crew rates, billing unit, packing, congestion, tunnel, overtime rate and grace) | **Extend**: versioned rate table with effective dates | Existing keys keep driving existing job billing until a verified migration. |
| Operational Job | `Job` | **Reuse unchanged** | Created or linked by an assignment; the driver app keeps reading it. |
| Driver Assignment | Job `driverInitials` + reassign endpoint | **New entity with history**; job field stays as the current value | Needed for reassignment reasons, timestamps, conflicts and notifications. |
| Vehicle Assignment | Driver `vanRegistration` (implicit) | **New**, per assignment | Vehicle model (category, capacity) is a separate new record or an extension of van compliance; open question. |
| Availability | none | **New, derived** | Computed from approved schedules, leave, off-road status and existing assignments; unknown stays unknown. Source records for shifts and leave are new and external-input dependent. |
| Job Activity | Job `activity[]`; proposed typed events (`src/lib/activity`) | **Reuse and extend** the catalogue with booking events | No second log. |
| Payments | Job `paymentBreakdown`, `finance.*`, driver summary, recorded receipts | **Reuse**; link by `bookingId` and `jobId` | No new ledger. Invoice payment records are an existing gap, tracked separately. |
| Audit History | Job reviews and `activity[]` only | **New**, append-only, covering every Booking OS entity | Who, when, before, after, reason, request id. |

New in total: Customer, Enquiry, Quotation, Quotation Version, Booking (+ stops), Assignment (+ vehicle),
Availability sources, versioned rate table, Audit entry. Everything operational stays on the existing Job.

## 2. State model

Separate fields, never one combined status. Your proposed lifecycle maps onto them like this:

| Proposed lifecycle state | Where it lives | Field and value |
| --- | --- | --- |
| New Enquiry | Enquiry | `status = new` |
| Quotation Pending | Quotation | `pricingState = pending` |
| Quotation Generated | Quotation | `pricingState = calculated` |
| Awaiting Confirmation | Enquiry and Quotation | enquiry `status = awaiting_customer`, quotation `status = sent` |
| Confirmed | Booking | `status = confirmed` |
| Unassigned | Assignment | no active assignment (derived, not stored) |
| Assigned | Assignment | `status = confirmed` |
| In Progress | Job (existing) | `status = IN_PROGRESS` |
| Completed | Job and Booking | Job `COMPLETED`; booking `completed` is set by the server from it |
| Cancelled | Booking, Quotation, Enquiry | each has its own `cancelled / declined / closed` value |

Fields and allowed values (proposed):

- Enquiry `status`: `new, needs_info, quoted, awaiting_customer, accepted, declined, expired, closed`; flag `duplicateOf?`.
- Quotation `pricingState`: `pending, calculated, failed, manual_review, unavailable`; `status`: `draft, sent, accepted, declined, superseded, expired`.
- Booking `status`: `pending_payment, confirmed, cancelled, completed`. A booking is `scheduled` only through its time
  fields, not a status.
- Assignment `status`: `proposed, confirmed, released, rejected` (+ `reason`).
- Job `status`: existing four values (unchanged).
- **Display status** shown in lists is a pure derived function of those fields (for example confirmed + no assignment
  = "Unassigned", confirmed + confirmed assignment + job READY = "Assigned"), tested as a table. It is never stored.

```
Enquiry: new -> needs_info <-> new -> quoted -> awaiting_customer -> accepted
                                                   \-> declined | expired        any -> closed
Quotation: pending -> calculated | failed | manual_review ; draft -> sent -> accepted | declined | expired | superseded
Booking: pending_payment -> confirmed -> completed ; pending_payment|confirmed -> cancelled
Assignment: proposed -> confirmed -> released ; proposed -> rejected
Job (existing): READY -> IN_PROGRESS -> COMPLETED ; READY|IN_PROGRESS -> CANCELLED
```

Rules: a transition is a server function with an allowed-from table, an actor, a required reason where stated
(cancel, reassign, price override), an audit entry and an Activity event. The client shows only the actions the
server returns for the record (`allowedActions[]`). Cancelling a booking releases assignments and cancels the
job through the existing path; a started job blocks cancellation unless an administrator forces it with a reason.

## 3. Assignment lifecycle

```
(no assignment) -> proposed (by dispatcher or recommendation) -> confirmed -> job visible to driver
confirmed -> released (reassigned or booking cancelled) ; proposed -> rejected (conflict or driver decline if supported)
reassign: release(A, reason) + confirm(B) in ONE transaction; both audited; driver A and B notified
```

Hard constraints checked on the server inside the same transaction as the write: driver active, no overlapping
confirmed assignment (with the agreed buffer), vehicle free and compliant (not past MOT or tax if the owner makes
that a hard rule), crew requirement met, booking in an assignable state, job not already started by another driver.

## 4. API contracts (proposed)

Conventions (from the existing code): cookie session, `adminFetch`, JSON, pence integers, ISO instants in UTC,
`{ items, pagination }`, `{ error: { code, message, fields? } }`, optimistic concurrency with `version`
(`409 version_conflict`), `Idempotency-Key` header on every create and transition, `allowedActions[]` on records.
Names are illustrative until the backend owner agrees them.

| Area | Method and path | Purpose | Notes |
| --- | --- | --- | --- |
| Website intake | `POST /api/public/enquiries` | Receive a submission | Not cookie auth: signed request (HMAC with a shared secret and timestamp) or a scoped API key; strict schema; rate limit; stores raw payload; returns `201 {enquiryId, reference}` only after commit; `Idempotency-Key` = submission id; duplicate delivery returns the same result |
| Manual enquiry | `POST /api/admin/enquiries` | Staff create | Same schema and normaliser as intake |
| Enquiry list and detail | `GET /api/admin/enquiries?q=&status=&pricing=&source=&from=&to=&page=` ; `GET /:id` | Inbox | Server-side search and paging; PII per role; `duplicateCandidates[]` |
| Quote calculation | `POST /api/admin/enquiries/:id/quotations` `{inputs}` | Create a version | Returns `pricingState`, `lines[]`, `totalPence` or `unavailable[]`; `422` with missing fields; never a zero total |
| Quote adjustment | `POST /api/admin/quotations/:id/versions` `{adjustments, reason}` | Override | Permissioned; original preserved; reason mandatory |
| Booking confirmation | `POST /api/admin/bookings` `{enquiryId, quotationVersionId}` | Confirm | Idempotent on the pair; sets state, writes audit, schedules the Calendar mirror (migration phase 2) |
| Booking list and detail | `GET /api/admin/bookings?...` ; `GET /:id` | All Bookings, workspace | Paged and sorted on the server |
| Modification | `PATCH /api/admin/bookings/:id` `{version, changes, reason}` | Edit | Server re-validates, recalculates a quote version when pricing inputs change, checks conflicts, audits |
| Cancellation | `POST /api/admin/bookings/:id/cancel` `{version, reason}` | Cancel | Releases assignments, updates job, notifies |
| Calendar data | `GET /api/admin/schedule?from=&to=&resource=drivers|vans` | Timeline | Bookings, assignments, jobs, unavailability, with `unknown` flags |
| Move or resize | `POST /api/admin/schedule/moves` `{bookingId, start, end, version, dryRun}` | Drag and drop | `dryRun` returns conflicts without writing; the real call re-validates |
| Driver availability | `GET /api/admin/availability/drivers?from=&to=` | Per driver `available | busy | off_shift | unavailable | unknown` with the evidence | Unknown is a first-class value |
| Van availability | `GET /api/admin/availability/vans?from=&to=` | Same for vehicles | Needs vehicle schedule data |
| Recommendations | `POST /api/admin/dispatch/recommendations` `{bookingId}` | Ranked eligible drivers | Each with `reasons[]`, `warnings[]`, `hardViolations[]`; no opaque score |
| Assignment confirm | `POST /api/admin/assignments` `{bookingId, driverInitials, vehicle, version, reason?}` | Assign / reassign | Transactional; `409` on conflict with the winning assignment |
| Driver sync | server side only | Create or update the Job for the driver app | Idempotent upsert keyed by assignment id; emits job events |
| Activity | `GET /api/admin/bookings/:id/activity` | Feed | Reuses the Activity event catalogue; system, admin, driver and notification events distinguished |
| Notifications | `POST /api/admin/bookings/:id/notify` | Notify driver or customer | Reuses push broadcast; outbox with delivery record; retry-safe by notification id |
| Payments | `GET /api/admin/bookings/:id/payments` | Read model | Joins existing job payment measures; estimated, agreed, collected, outstanding kept separate |
| Pricing admin | `GET/POST /api/admin/pricing/rate-plans`, `/versions`, `/parity` | Settings | Effective-dated; parity report against historical Make.com quotes |

Typed contract (client): `src/lib/booking/` (stage 2) mirrors these as TypeScript types plus pure validators and
state tables; the mock API in `src/mocks` implements them with fictional data.

## 5. Security and data integrity

| Concern | Requirement |
| --- | --- |
| Role-based permissions | A server permission matrix (view customer contact, create, confirm, price override, assign, reassign, cancel, delete, pricing admin, view payments). The client receives the caller's permissions and hides what is refused; it never decides. **Matrix is unknown today.** |
| Server-side authorisation | Every endpoint checks session and permission; list endpoints filter fields (for example mask phone and email without the permission); drivers can only read their own assignments and jobs. |
| Input validation | One schema per endpoint, shared between intake and manual entry; lengths, formats, postcode rules, date ranges, pence integers; unknown fields kept in the raw payload, not applied. |
| Duplicate bookings | `Idempotency-Key` on creates; unique constraint on (enquiry, accepted quotation version); suspected-duplicate flag on enquiries from verified email or phone plus date window; no auto-merge. |
| Idempotency | Stored per key with the original response; replay returns it; a different body with the same key is rejected. |
| Concurrent assignment | Conflict check and write in one transaction; unique or exclusion constraint on (driver, time range) and (vehicle, time range) for confirmed assignments; the loser gets `409` with the winning record. The UI re-fetches and shows who won. |
| Transaction safety | Booking confirm, assignment, reassignment, reschedule, cancel and price change are atomic with their audit and outbox rows. |
| Sensitive customer data | Minimum collection; PII not in logs, URLs or analytics; masked by default in lists; export and retention policy agreed; the raw intake payload access is restricted. |
| Audit trail | Append-only entry per change: actor, time, entity, before, after, reason, request id. Never edited; corrections are new entries. |
| API authentication | Admin: session cookie with SameSite and CSRF protection (to confirm); public intake: signed requests with timestamp and replay window; driver app: driver session. |
| Retry-safe notifications | Outbox table written in the same transaction as the change; a worker sends with a unique notification id; resends update the delivery record instead of duplicating; delivered and read states are shown only when the provider reports them. |
| Rate limiting | Public intake, login, quote calculation. |

## 6. Where the code lives (client)

`src/lib/booking/` contract and pure logic; `src/mocks/booking.ts` fictional handlers; admin pages under
`src/screens/admin/dashboard/pages/booking/`; shared Booking OS components under
`src/screens/admin/dashboard/components/booking/`; tokens in a separate stylesheet scoped to the Bookings area
(`bookingTheme.css`). No new state library, no new data-fetching library, no second event system: TanStack Query,
URL state and the existing polling pattern. Real-time is polling until the backend offers push events; nothing is
described as live otherwise.
