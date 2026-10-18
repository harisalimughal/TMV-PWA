# Booking OS 03: flows, boundaries, risks and delivery plan

## 1. Data flow: current and proposed

```
CURRENT
Website form --> Make.com (quote maths) --> Calendar event (extension)
Admin "Create a job" --------------------> Calendar event
Calendar event --> backend sync/parser --> Job (READY, driverInitials) --> /api/jobs/list --> Driver app
Driver app --> actions, evidence, payment --> Job --> Admin dashboard, reports, push

PROPOSED (end state)
Website form --> POST /api/public/enquiries --> Enquiry --> Quotation versions (internal pricing)
Staff entry ---> POST /api/admin/enquiries ---^                 |
Quotation accepted --> Booking (confirmed) --> Assignment (driver + vehicle, transactional)
Assignment confirmed --> Job upsert (idempotent) --> Driver app (unchanged) --> existing job execution
Booking, assignment and job events --> Activity + audit + notification outbox
Payments, reports: read the existing job payment measures through bookingId and jobId

MIGRATION (phase 2): Booking --> mirror writes Calendar event in the format the sync expects --> existing sync --> Job
```

## 2. Integration boundaries

| Boundary | Owner | Contract | Rule |
| --- | --- | --- | --- |
| Dashboard <-> backend | Backend repo | Section 4 of `02-TARGET-ARCHITECTURE.md` | Client codes to the typed contract and mocks; live mode shows "not available" until endpoints exist |
| Website -> intake | Website repo (external) | Signed `POST /api/public/enquiries` | Specified in `04-WEBSITE-INTAKE.md`; the existing website and Make.com stay untouched until verified |
| Booking -> Calendar mirror | Backend | Same title and description format as today | Idempotent on `calendarEventId`; kill switch |
| Assignment -> Job -> driver app | Backend + this repo's driver app | Existing `/api/jobs/*` unchanged | Specified in `05-DRIVER-INTEGRATION.md`; driver app code changes only if the contract needs a field |
| Pricing | Backend (authoritative) | `(inputs, ruleVersion) -> lines, total` | Parity gate before any customer-facing use |
| Payments and reports | This repo + backend | Existing measures | No second ledger or exporter |
| Notifications | Existing push, SMS | `/api/push/*`, Firetext | Outbox and retry-safe ids |

## 3. Migration

Phases and gates are in `00-FRAMEWORK.md` section 6 (observe, shadow, internal-first with Calendar mirror, internal
primary, retire). Additional rules from this audit: map every historical Calendar event to a Booking by
`calendarEventId` read-only before any write (no historical edits); reconcile upcoming bookings nightly across
Booking, Calendar and Job; drivers are mapped by `initials`; never run two creators for the same booking; rollback
is switching the flag back to phase 1 and replaying the mirror.

## 4. Technical risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Make.com quote differs from internal engine | High until tested | Wrong prices | Shadow mode, golden fixtures, parity report, manual review state |
| Calendar format is an undocumented contract | High | Sync breaks | Capture real samples; mirror identical format |
| No availability or vehicle data | Certain | Bad dispatch | Unknown is a state; recommendations show reasons; conflicts from real jobs only |
| Roles unknown | High | Privilege errors | Permission matrix first; server enforced |
| Duplicate bookings during coexistence | Medium | Double jobs | Idempotency keys, one creator per phase, nightly reconciliation |
| Mixed pence and pounds on existing endpoints | Medium | Rounding or 100x errors | New contracts in pence; convert once at the edge; contract tests |
| Time zone and DST errors in scheduling | Medium | Wrong slot | London time functions with DST tests; instants stored in UTC |
| Polling load and staleness | Medium | Stale boards | Intervals tuned, stale labels, version conflicts on write |
| Large boards (calendar, lists) | Medium | Slow UI | Server paging, windowed rendering, memoised blocks |
| Public intake abuse | Medium | Spam, data exposure | Signed requests, rate limits, validation, no price trust |
| Scope | High | Unreviewable changes | One PR per stage, feature flags |

## 5. Unresolved business requirements (blocking or shaping)

Make.com blueprint and examples; website field list and validation; Calendar event samples; roles and who may price,
confirm, assign, cancel; meaning of "paid online" and deposits; quote validity period and customer acceptance
route (email link, phone, payment); multi-stop and inventory scope; vehicle categories and crew rules; working
hours, leave and buffers; travel-time source; cancellation and rescheduling policy and fees; customer
communications and wording; retention of unbooked enquiries; automatic assignment rules (off until approved);
reporting definitions for conversion and utilisation.

## 6. Roadmap

| Stage | Output | Gate |
| --- | --- | --- |
| A Audit and architecture | these documents | owner review |
| B Design system | scoped tokens, shared components, documentation | visual and a11y checks |
| C Contract and mock | `src/lib/booking`, mock handlers, state tables and tests | table tests |
| D Command Centre, Enquiries, Create, Details, All Bookings | UI over the contract, live mode "not available" until backend exists | regression, axe, screenshots |
| E Calendar and Dispatch | timeline and dispatch UI, server-validated moves (mock server validates for preview) | conflict tests |
| F Pricing management | Settings UI over existing rates plus gated sections, parity report UI | pricing evidence |
| G Website intake and driver integration | specifications and client pieces; backend work external | backend and website access |
| H Payments and reports | read models and report columns | existing semantics preserved |
| I Release readiness | audit, blockers, runbook | production gates |

## 7. Dependency map: what can be done now

Legend: **Now** = can be built and verified in this repository alone (against a typed contract and clearly labelled
sample data); **Backend**, **Make.com**, **Website**, **Driver app** = needs that system or its owner's input.

| Feature | Now | Needs | Notes |
| --- | --- | --- | --- |
| Architecture docs, contract types, state tables, tests | Yes | none | pure code |
| Design tokens and shared components | Yes | none | scoped, no global restyle |
| Bookings navigation and Command Centre shell | Yes | none | live data: Backend; KPIs show "not available" without it |
| Preview mode with sample data (labelled) | Yes | none | never presented as live |
| Enquiry inbox UI | Yes | Backend for real enquiries | mock data behind the contract |
| Booking creation wizard UI and validation | Yes | Backend to save; Make.com rules for pricing | Quote step shows "pricing unavailable" until the engine exists |
| Booking details and All Bookings UI | Yes | Backend | table paging and filters built to the contract |
| Calendar timeline (rendering, keyboard moves, dry-run UX) | Yes | Backend for validation and persistence | the mock server validates for preview only |
| Dispatch UI and recommendation display | Yes | Backend and availability data | recommendation logic is server side |
| Existing "Notify Driver" from a booking | Yes | none | existing broadcast endpoint |
| Pricing settings UI over existing keys | Yes | none | existing Settings keys; new sections gated |
| Pricing engine port and parity | No | **Make.com** export, historical quotes | gated |
| Website intake endpoint | No | **Backend** (and **Website** changes) | contract and validator here |
| Direct job delivery to drivers | No | **Backend**, **Driver app** contract review | spec here |
| Calendar mirror and reconciliation | No | **Backend**, Calendar samples | spec here |
| Payments link and booking financial summary | Partly | **Backend** read model | UI over existing job measures |
| Availability, shifts, leave | No | **Backend** and owner data | unknown stays unknown |
| Automatic assignment | No | approved business rules | architected, off |
