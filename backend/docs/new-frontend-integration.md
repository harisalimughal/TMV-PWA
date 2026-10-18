# New frontend integration

## Plan (18 October 2026)

1. Inventory the `web-new` snapshot and compare its API contracts with `web` and the backend.
2. Overlay its dashboard, shared components, styles and build safeguards into `web`.
   Keep the existing driver screens, driver API clients, public assets, offline outbox,
   and operational backend contracts. Keep `web-new` intact as the supplied reference.
3. Default local development to the real local API; mocks require explicit opt-in.
   Never connect development automatically to production.
4. Add authenticated Activity endpoints over the existing append-only audit records,
   with stable cursors and separately persisted admin read markers. Do not rewrite history.
5. Adapt existing jobs into Booking OS list/detail/calendar/summary responses. Keep job
   identifiers, Calendar identifiers, assignments, workflow states, pricing and evidence intact.
   Unknown payments, availability and quotation information must stay unknown.
6. Persist new enquiries and manual quotations separately, with optimistic concurrency.
   Unsupported booking mutations and Calendar configuration must fail explicitly until
   their operational synchronization rules are implemented; never mutate legacy jobs via
   a parallel booking datastore or run the frontend preview server in production.
7. Keep every supplied UI module and view, including controls whose server workflows
   are not connected. The user confirmed that these workflows will be decided later.
   Missing operations must return an explicit error, never fabricated success.
8. Verify the frontend types, regression suite, production bundle and driver precache,
   and backend types and tests using synthetic fixtures with external calls blocked.
9. Document the final contract coverage and remaining limitations. Do not push, deploy,
   run maintenance/reset/backfill commands, connect to production, or migrate live data.

## Preservation rules

- No collection renames, drops, bulk replacements, or schema migrations.
- New fields/collections are additive. Existing repositories and Calendar sync own jobs.
- Browser storage keys and offline queue persistence stay compatible.
- Existing driver credentials, sessions, photos, signatures, reports, settings, and
  financial records remain in their existing stores.
- Validation uses mocks and fixtures; local tests must not read the real `.env`.

## Findings

- The snapshot omits driver screens/API modules and public assets. A directory replacement
  would lose application source needed by the driver PWA.
- Existing dashboard `api.ts` has compatible endpoint shapes, adding an admin transport,
  abort signals and longer maintenance timeouts.
- Activity and Booking OS describe proposed APIs; their preview implementations are
  fictional and are not production backend implementations.
- Docker and the backend already serve `web/dist`, so integration belongs in `web`.

## Implementation and verification

The Aurora dashboard and all its supplied views are merged into `web`, the build path
already used by Docker and the backend. `web-new` is unchanged. The working driver
screens, API clients, public icons and offline queue remain in place because the
snapshot did not include their replacements. Shared providers and admin host routing
are connected to the existing application entry point.

The final source inventory found zero supplied `web-new/src` files missing from
`web/src`. The original snapshot is retained intact for comparison. No existing
database repository, job workflow, reporting backend, driver auth/job API client or
offline outbox file was changed.

### Connected APIs

Existing jobs, drivers, accounts, reports, evidence, liability/scenario submissions,
vehicles, mileage/fuel/service, compliance, live fleet, road charges, notifications,
message templates, settings and maintenance retain their existing endpoints.

Added authenticated endpoints:

- Activity feed, conversation list, per-job history, unread count and read marker.
  Existing audit entries retain their original content and are labelled legacy records,
  not retroactively claimed as verified driver actions. Read markers are shared by the
  existing single admin identity and stored in `admin_activity_reads`.
- Booking OS summaries, lists, details, activity, schedule and driver availability.
  These project existing jobs without copying or modifying them. Completed jobs use
  their captured driver identity when available. Shifts, quotation revenue, receipts,
  conversion attribution and past assignment timestamps are not invented.
- New staff enquiries, manual quotation versions, close and request-information notes.
  These use `booking_enquiries`; `_id` enforces create idempotency and document version
  comparison prevents concurrent overwrites. Request-information notes do not send mail.

### UI retained for later backend work

The supplied Booking OS wizard, enquiry inbox, booking details, calendar/move panel,
dispatch, pricing status and Google Calendar setup screens remain in the source and
navigation. Preview mode remains explicitly labelled fictional. Live mode does not
fall back to preview data after a server error.

Enquiry confirmation, automatic quote pricing, Booking OS assignment/moves/cancellation,
and its proposed OAuth Calendar connection are not connected. Unsupported writes fail
without changing data. Existing Calendar sync and job creation/reassignment still work
through the established Jobs APIs. Direct two-way chat is not available; the existing
Notify Driver notification flow is retained.

### Compatibility fixes

- Preserved completed-job reassignment notices, linked attempts and Admin Completed labels.
- Kept the driver's existing IndexedDB/outbox and notification history schemas and keys.
- Added the matching same-origin notification URL guard needed by the new shared client.
- Local dev defaults to the real configured API; mocks require `VITE_MOCK_API=true`.
- Fixed London date-only chart buckets being parsed in the execution host timezone.
- Retained the old local report-preview entry points after component relocation.
- Replaced obsolete old-layout tests (which asserted the retired sidebar, route destinations
  and report auto-collapse) with the supplied new routing, navigation, cards and driver
  reporting coverage. Kept operational backend tests and retained-screen tests.

### Verification

Backend: 67 files / 631 tests passed, including 11 new HTTP and preservation regressions;
typecheck and build passed. Tests block external service calls and use synthetic config.

Frontend `npm run verify` passed: 158 files / 1,219 tests, typecheck, production
build and driver precache check. The final cache is 1,964 KiB against a 2,400 KiB
budget. Admin-only chunks are excluded. Local
mock preview rendered Overview and the retained Booking OS calendar without browser
console errors.

Backend build passed again after the final adapter adjustments, and all 11 new
integration/preservation tests passed again. `git diff --check` passed.

The production build retains a large-admin-bundle warning and the supplied optional
`VITE_ADMIN_HOSTNAMES` placeholder warning when unset. Neither prevents the build or
offline-cache check. Provider-backed end-to-end behavior has not been tested against
production during this task.

No production database or provider was contacted,
and no migration, reset, backfill, push or deployment was run.

### Subsequent MA dashboard filter

The subsequent [MA filter](admin-ma-filter.md) adds a browser-persisted Include MA
preference and scoped backend read queries. These later changes include repository
read filtering and cache isolation; stored data and write workflows are unchanged.
