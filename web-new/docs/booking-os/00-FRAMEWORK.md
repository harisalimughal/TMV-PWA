# TMV Booking OS: development framework

Status: **framework only**. No production code was changed to write this. Everything marked *verified* was read
in this repository on `main` (merge commit `c2cebac`); everything marked *unknown* or *proposed* was not, and is
not to be treated as fact. Written plainly, no timelines (they would be guesses without backend access).

Contents: 1 What exists and what does not, 2 Today's flow, 3 Entities, 4 Pricing, 5 Availability, 6 Migration,
7 Where the code goes, 8 Security and integrity, 9 UI direction, 10 Verification standard, 11 Stages,
12 Decisions needed, 13 Risks.

## 1. What exists and what does not

### Verified in this repository

| Area | Fact | Where |
| --- | --- | --- |
| Stack | Vite 6, React 18, TypeScript (strict), Tailwind with CSS-variable tokens, TanStack Query 5, Luxon, Recharts, Leaflet, Vitest 4 + Testing Library. No router library (query-string routes). | `package.json`, `navigation.ts` |
| Products | Aurora admin (`src/screens/admin/`), driver PWA (`src/App.tsx`, `src/screens/`, `src/components/`), unrouted classic admin (kept, not imported across). One build. | `CLAUDE.md` |
| Backend | **Not here.** The app calls same-origin `/api/...` with cookie sessions (`tmv_admin_session`, separate driver session). Express + MongoDB live in other repositories. | `CLAUDE.md`, `docs/audit/02-APPLICATION-INVENTORY.md` |
| Admin modules today | Overview, Jobs, Activity, Live Fleet, Drivers, Van, Liability, Alerts and messages, Settings (plus Driver report and Data maintenance routes). **There is no Payments, Reports or Tracker module with those names**: reports live inside Drivers and Overview, the tracker is Live Fleet, payments appear only as measures on jobs and reports. | `NAV` in `navigation.ts` |
| Not built | Bookings, Payments, Charges and reconciliation, driver availability, on-time %, invoice payment tracking. `NAV_GROUPS` already reserves the place: "Bookings ... join when their screens do". | `navigation.ts`, `CLAUDE.md` |
| Manual booking | Jobs page "Create a job" (`AddJobModal`) posts `POST /api/admin/jobs` with customer, addresses, crew size, price (pounds), `paidOnline`, optional driver initials, local start and finish. The code comment says this creates a **real Calendar event** and the job appears after sync; the form copy says only confirmed bookings (`paidOnline`) are synchronised. Backend behaviour behind that is unverified. | `AddJobModal.tsx`, `api.ts` `addJob` |
| Assignment | `POST /api/admin/jobs/:id/reassign {driverInitials}`; bulk reassign in the UI. Drivers are keyed by `initials`. A driver has `vanRegistration` and `imei` (tracker). | `api.ts`, `api/admin.ts` |
| Job model | `Job` / `NormalizedJob`: `jobId`, `calendarEventId`, `driverInitials`, customer fields, `pickup`, `dropoff`, `crewSize`, `basePrice`, `paidOnline`, `bookedStart/Finish`, actual times, `timeBilling` (ruleVersion, rates and their source), extras parsed from the Calendar description (`floorFrom/To`, `vanSize`, `hireDurationText`, `extraRequest`, `inventory`, `extraChargeText`), `rawTitle` such as `2 Men - £170 - 16:00`, `rawDescription`. Status `READY, IN_PROGRESS, COMPLETED, CANCELLED`. | `src/api/jobs.ts`, `dashboard/types.ts` |
| Pricing inputs in Settings | `CREW_RATE_<n>_MAN`, `CREW_BILLING_UNIT`, `PACKING_RATE`, `CONGESTION_CHARGE`, `TUNNEL_CHARGE`, `OVERTIME_RATE_PER_30`, `OVERTIME_GRACE_MINS`. Used for **time billing and extras after the job**, per `timeBilling.rateSource` ("calendar", "settings", ...). Whether these also drive the original quote is **unknown**. | `PricingSettings.tsx`, `src/api/jobs.ts` |
| Driver app | Job list, workflow (on my way, start, arrival, loaded, extra charges, overtime, payment, signature, review), scenarios with offline outbox, van, messages. Driver endpoints: `/api/jobs/list`, `/:id/viewed`, `/on-my-way`, `/start`, `/actions`, `/evidence`, `/signature`, `/driver-summary`. | `src/screens`, `src/api/jobs.ts` |
| Money and time | API money is mostly pence (some endpoints pounds: a known mixed-unit risk). All reporting days are Europe/London via Luxon. | `CLAUDE.md`, `docs/audit/08` |
| Mock API | `src/mocks` is dev and demo only (tree-shaken from production, except the demo build). Fictional data. | `CLAUDE.md` rule 8 |
| Quality gates | `npm run verify` = typecheck + Vitest + build + PWA precache guard; CI runs the same. **No ESLint (or Prettier) configuration exists in the repository**, so "linting" cannot be run as asked; see section 10. | `package.json`, `.github/workflows/ci.yml` |
| Precache rule | Admin code must stay out of the driver's offline cache; admin enters through one dynamic import. A Bookings area is admin code and must follow this rule. | `CLAUDE.md` rule 1 |

### Not in this repository (so unknown here)

The website booking form, Make.com scenarios and their pricing maths, the Calendar browser extension, the
Calendar-to-backend sync and its parser (`backend/src/jobs/booking.service.ts` is referenced but absent), the
backend routes and schemas, MongoDB collections and indexes, the authorisation rules (the admin session shows
no roles in the client), SMS/email sending (Firetext key exists in Settings), the push sender, payments
processing for "paid online", driver schedules and leave records, vehicle schedules.

Nothing below may claim integration with these until the owner provides access or exports.

## 2. Today's flow (as far as it can be known)

```
Website form -> Make.com (quote maths) -> Calendar event (extension)          [outside repo: unknown details]
Calendar event -> backend sync/parser -> Job (READY), driver by initials      [backend, outside repo]
Admin "Create a job" -> POST /api/admin/jobs -> Calendar event -> sync -> Job [client verified, rest unknown]
Admin reassign -> POST /jobs/:id/reassign                                     [client verified]
Driver app <- /api/jobs/list (own jobs) ; actions, evidence, payment, signature
Job state, activity, charges, tracker events -> admin dashboard
```

Consequence for the design: **today the Calendar event is the de facto booking record and the Job is derived
from it.** A booking system that replaces this must either keep emitting what the sync expects (title, description
fields, event id) during migration, or the backend must accept internal bookings directly. That is a backend
decision, see section 6.

## 3. Entities (proposed, to be confirmed with backend)

Distinct records, never one row with a status that pretends to be all of them:

| Entity | Meaning | Created by | Becomes |
| --- | --- | --- | --- |
| **Enquiry** | A customer asked. Raw submission kept verbatim plus a normalised copy. | Website intake, phone entry by staff | one or more Quotations |
| **Quotation** | A priced offer for an enquiry, tied to a pricing-rule version and its inputs. Has expiry and revisions. | Pricing engine, edited by staff | a Booking when accepted |
| **Booking** | The confirmed commercial agreement: customer, route, date and time window, crew, agreed price, payment terms. | Acceptance of a quotation, or staff entry | has zero or more Assignments |
| **Assignment** | A driver (and van) allocated to a booking for a time window. Can change without the booking changing. | Dispatcher | produces the operational Job for the driver app |
| **Job** | The driver's operational record: workflow state, evidence, timings, charges. **Already exists and is not rebuilt.** | Assignment sync | reporting, payments |

Rules that hold everywhere: an enquiry is not a booking; a quotation is not a booking; a booking is not a
job; assignment changes never edit the booking's commercial terms; a price change after confirmation is a new
revision with a reason, not an overwrite.

Proposed state machines (names only, final list needs the owner):
Enquiry `new > quoted > accepted | declined | expired | lost`;
Quotation `draft > sent > accepted | declined | expired | superseded`;
Booking `pending_payment > confirmed > scheduled > in_progress > completed | cancelled`;
Assignment `proposed > confirmed > released`.
Each transition is a server-side function with an allowed-from table, an actor, a reason where needed, and an
audit record. The client never decides a transition is legal; it only offers the actions the server reports.

Identity: server-generated opaque ids per entity, plus human references (for example `TMV-Q-...`, `TMV-B-...`).
The existing `jobId` (`TMV-` + hex) and `calendarEventId` stay as they are and are stored on the Booking or
Assignment so the old and new worlds can be joined and reconciled.

Money: integer pence everywhere in storage and in new endpoints; pounds only at presentation (the existing
mixed-unit risk, audit F-13, is not repeated). Time: UTC instants stored, London day derived in one function.

## 4. Pricing

Rules from the owner brief, restated as constraints:

1. The engine reproduces the existing Make.com calculation exactly. It is not designed from scratch.
2. Until the Make.com scenario export (blueprint) and a set of real worked examples are provided, **no live
   price may come from this system**. Staff may enter a price by hand (as `AddJobModal` does today); the system
   records it as `source: manual`.
3. The engine is a pure, versioned function: `(inputs, ruleVersion) -> {lines[], totalPence, unavailable[]}`
   with no clock, network or database access. Rates come from a versioned rate table, not constants in code.
4. Golden tests: a table of real past quotes (inputs and the amount Make.com produced) that must match to the
   penny, recorded in the repository as fixtures with customer details removed.
5. **Shadow mode first**: for a period the engine runs next to Make.com on every enquiry, both results are
   stored, and mismatches are reported. It is promoted only after an agreed match rate over real volume.
6. If an input is missing the engine returns an explicit "cannot price" with the missing fields; it never
   substitutes a default.

Known inputs (verified, but their use in the quote is unknown): crew-size hourly rates, billing unit,
packing rate, congestion and tunnel charges, overtime rate and grace minutes. Known outputs on the job:
`basePrice`, `rawTitle` (`2 Men - £170 - 16:00` suggests crew, a total and a start time), `timeBilling`
(`ruleVersion`, `rateSource`).

Missing requirements (needed before any pricing code): the Make.com blueprint; every website form field and
its allowed values; how distance or duration is estimated (service, API, fixed table); minimum charge and
minimum hours; van size, floors, stairs, lift, parking, packing, inventory and extra-service effects; peak or
weekend multipliers; discounts and promo codes; VAT treatment; deposit and "paid online" rules; rounding;
how the figure becomes the Calendar title.

## 5. Availability

Availability is **derived, never entered as a guess**. Allowed sources, all of which must be real records:
approved driver schedules (working hours, days off, leave), vehicle schedules (service, MOT, off-road), existing
assignments and jobs, and verified operational records. Today the repository has driver and van records
(initials, registration, compliance dates in the Van module) and jobs with booked windows, but **no schedule or
leave data**. Until that exists the system can only show *conflicts with existing jobs* (a verified fact) and must
label everything else "availability not known". Suggested drivers (roadmap stage 7) come after, with a reason
shown for each suggestion.

Conflict rules to agree with the owner before coding: buffer between jobs, travel time source, maximum working
day, multi-day jobs, two-person and three-person crews (one driver plus helpers: helpers are not accounts today),
and whether a van can be shared.

## 6. Migration (controlled, reversible)

Principle: one source of truth at the end, never two writers in the middle.

| Phase | Writes | Calendar and Make.com | Exit test |
| --- | --- | --- | --- |
| 0 Observe | none new | unchanged | Requirements and exports received (section 12) |
| 1 Shadow | Enquiries and shadow quotes recorded **in addition** to Make.com | unchanged, still authoritative | Quote match rate agreed; no customer-visible change |
| 2 Internal first, mirrored | Bookings and assignments written internally; a mirror writes the Calendar event in the format the sync expects | still running, now fed by the mirror; kill switch returns to phase 1 | Nightly reconciliation (internal vs Calendar vs Jobs) clean for an agreed period |
| 3 Internal primary | Internal only; Jobs created by assignment sync | Calendar read-only archive; Make.com off for new enquiries | Rollback drill passed |
| 4 Retire | none | removed | Sign-off |

Every phase has a feature flag per capability, an idempotency key on every cross-system write (the existing
`calendarEventId` is the join), a reconciliation report, and a documented rollback. **Do not disable Calendar or
Make.com before phase 3.** The current "Create a job" flow stays as it is until its replacement is live.

## 7. Where the code goes

Follow the pattern already used for Activity chat (shared contract, API client, hooks, mock handlers, UI,
documented backend proposal) rather than inventing a new one:

- `src/lib/booking/` : entity types, state tables (allowed transitions), money and time helpers, pricing input
  types, and the contract/invariants as a typed, tested module (no React). The pricing engine, if it runs in the
  client at all (see below), also lives here as a pure module with golden tests.
- `src/screens/admin/dashboard/api` additions through `adminFetch` only (CLAUDE.md rule 7), never plain `fetch`.
- `src/screens/admin/dashboard/pages/Bookings/...` with its own nav entry **Bookings** (the reserved slot in
  `NAV`), URL-state filters (`hooks/useUrlState.ts`), unsaved-edit registration (`utils/unsavedChanges.ts`),
  `Modal` or `Drawer` for dialogs (CLAUDE.md rule 2), job opens as the existing `?job=` dialog.
- `src/mocks/booking.ts` : fictional data and handlers so every screen can be previewed (rule 8). Mock data is
  never presented as real; the demo build keeps its "demo data" framing.
- `docs/booking-os/` : this framework, the requirements log, the backend contract proposal, decision records.
- Admin only. The booking code enters through the existing single admin dynamic import so the driver precache
  guard keeps passing (`npm run check:precache`).

**Where the pricing engine runs** is an open decision. The authoritative price must be computed server-side (a
client can be altered). A client copy is acceptable only for instant previews and must be labelled as such. Since
the backend is not here, the engine's first home is the typed contract plus golden tests; the server port is a
backend task against the same fixtures.

The driver web application is not modified by Booking OS stages; it keeps consuming `/api/jobs/...`. Any change
to what a driver sees (for example booking notes) goes through the existing Job fields.

## 8. Security and integrity requirements

Authentication and authorisation: reuse the cookie session and the 401 handling in `adminFetch`. The client shows
no admin roles, so **the authorisation matrix is unknown**: who may confirm a booking, change a price, assign,
cancel, refund, or view customer contact details must be decided and enforced on the server; the UI only hides
what the server refuses. Record-level access: a driver sees only assignments to them (already true for jobs).

Public intake (the website): server-side validation of every field, length limits, rate limiting, bot protection,
no trust of client-computed prices, and a clear separation so a hostile enquiry cannot create a confirmed booking.
Customer data (names, phone, email, addresses) is personal data: collect the minimum, no personal data in logs or
URLs, retention period agreed, export and deletion path considered.

Integrity: creation, confirmation, assignment, reschedule and price change are transactions with optimistic
concurrency (version field, reject stale writes), idempotency keys (a retry must not double-book or double-charge;
the current `AddJobModal` already warns about duplicates after a dropped connection, which is the symptom),
append-only audit entries (who, when, before, after, reason), soft delete for anything customers or finance may
need, and a reconciliation job comparing internal bookings, Calendar events and Jobs. Conflict checks run in the
same transaction as the assignment write.

Client rules: input validation mirrors the server (never replaces it), money in pence, London time, missing data
shown as missing (CLAUDE.md rule 3), every action has a visible success or failure state.

## 9. UI direction

- Reuse the admin design system (`components/ds`: `Action`, `Notice`, `Badge`, `Section`, `Table`, `Toolbar`,
  `Modal`, `Drawer`, `MetricRow`) and tokens in `adminTheme.css`. New screens follow the Jobs and Generate Report
  patterns: toolbar with URL-state filters, cards and table views, centred dialogs (the owner prefers centred
  dialogs to side drawers for detail), real loading, empty, error and partial states.
- **Theme decision needed.** The brief asks for a warm, premium, soft-neutral light mode and true black / charcoal
  dark mode. The repository's rules say Aurora Light is a deliberately **neutral** white on off-white theme
  (`#F8F9FB` canvas) that a test guards, and Midnight is true black with pure-grey neutrals and a ban on navy.
  Dark mode already matches the brief. For light mode, either keep the existing tokens (recommended: one design
  language, no test changes) or add a warmer neutral set through the same tokens, which means changing the guarded
  theme and its tests. Needs an explicit answer.
- Accessibility: keyboard paths for every action, visible focus, labelled controls, errors tied to fields,
  live-region announcements for results, reduced motion, axe-clean states, 390 px layouts (the checks used for
  Generate Report are the reference).
- Calendar view: build on a real accessible grid, not a screenshot of Google Calendar; first version read-only
  over existing jobs (verified data), then editing once assignment rules exist.

## 10. Verification standard for every stage

Run and record: `npm run typecheck`, `npm run test:run`, `npm run build`, `npm run check:precache` (all inside
`npm run verify`), plus browser checks (light and dark, 1440 / 1024 / 768 / 390), axe on new screens, and a
regression pass over the modules in the brief (Overview, Jobs, Drivers, Van, Live Fleet, Activity, Alerts and
messages, Settings). New logic gets colocated tests; state machines get table tests for every allowed and every
refused transition; the pricing engine gets golden tests.

Checks that **cannot** be run today, to be recorded in every report until fixed:

- **Linting**: no ESLint or Prettier config in the repository. Adding one is a separate, reviewed change (it will
  surface existing violations); it is not bundled into a feature stage.
- **End to end tests**: no Playwright or Cypress suite is installed in the project (Playwright exists only as a
  global tool used for screenshots). Server contract and integration tests belong to the backend repository.
- **Anything against the real backend, Make.com, Calendar or the website**: not reachable from this environment.
- Microsoft-product and real-device checks, as before.

## 11. Stages (each its own prompt; stop after each)

| Stage | Output | Needs from the owner | Done when |
| --- | --- | --- | --- |
| 1 Requirements capture | `requirements.md`: every website field, Make.com blueprint and worked examples, Calendar event format, sync behaviour, roles, notifications, payment flow | exports and access (section 12) | Open questions answered or logged as risks |
| 2 Domain contract | `src/lib/booking/` types, state tables, invariants, tests; backend contract proposal; mock handlers | stage 1 | Table tests for all transitions; contract reviewed by backend owner |
| 3 Pricing engine port | pure engine, rate table, golden fixtures, shadow-compare design | Make.com export, 30+ real quotes | Exact match on every fixture |
| 4 Enquiries and quotations UI | Bookings area: inbox, enquiry detail, quote editing, revisions | stage 2 and 3 | States, a11y and regression checks pass |
| 5 Booking confirmation | confirm flow, payment-state handling, duplicate protection | payment rules | Idempotency and conflict tests |
| 6 Scheduling calendar | read-only calendar over bookings and jobs, then reschedule with conflict checks | availability sources | Conflicts match real jobs |
| 7 Assignment and dispatch | assign driver and van, conflict and compliance warnings, suggestions with reasons | schedules and leave data | No suggestion without a stated reason |
| 8 Driver sync | assignment to Job creation, notifications | backend work | Round trip tested with the driver app contract |
| 9 Migration | phases 1 to 3 of section 6, reconciliation report, kill switches | all above | Rollback drill passed |
| 10 Reporting and payments | booking to job to payment traceability, reports | payment records | Totals reconcile |

## 12. Decisions and inputs needed (blocking)

1. Access to the backend repository (or its route list, schemas and the Calendar sync parser), read-only is
   enough to start.
2. The Make.com scenario export, plus 30 or more real past enquiries with the quote each produced.
3. The website form field list and where its submissions are posted today.
4. A sample of real Calendar events (title and description) for each job type.
5. Who may confirm bookings, change prices, assign, cancel, and see customer contact details (roles).
6. Payment: what "paid online" means (provider, deposit or full), refunds, and who records it.
7. Driver working hours, leave and van off-road sources, buffers and travel-time rules.
8. Customer communications: which emails and SMS, from where, and the approval wording (Firetext is configured).
9. Light theme: keep the existing neutral tokens or introduce a warmer set (section 9).
10. Where the authoritative price is computed and whether a client-side preview is wanted.
11. Retention and deletion expectations for enquiry data from people who never book.

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Pricing mismatch with Make.com | wrong quotes | shadow mode, golden fixtures, no live use until matched |
| Two writers during migration | double bookings, drift | one writer per phase, idempotency on `calendarEventId`, nightly reconciliation |
| Calendar format is the hidden contract | sync breaks | capture real samples first; keep the mirror format identical until phase 3 |
| Mixed pence and pounds | rounding errors | pence only in new contracts |
| Availability invented | bad dispatch | derive from real records only; say "not known" otherwise |
| Public intake abuse | spam, fake enquiries, data exposure | validation, rate limits, bot protection, no price trust |
| Roles unknown | privilege errors | server-enforced matrix before any write feature ships |
| No lint and no e2e in the repo | regressions slip | verify gate plus browser/axe checks now; lint and e2e as separate reviewed work |
| Scope size | rushed, unreviewable change | strict stage boundaries, one PR per stage |
