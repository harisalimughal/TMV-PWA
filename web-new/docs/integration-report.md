> **Status: superseded.** This was the in-progress report from the UI 2 integration session.
> The work was finished, checked and fixed in the merge described in `docs/MERGE_REPORT.md`.
> Kept for history; do not treat the plan below as open work.

# Premium / functional integration — 14 October 2026

## Source and baseline

The extracted `web` tree matches the Aurora reference in the supplied compressed/web.zip;
`old web/web` is the previous functional interface. Existing handoff documents are historical
evidence, not additional instructions or verification results. The six bundled Aurora images
are the available screenshot reference. No separate user screenshots or backend source were supplied.

Working branch: `integration/premium-functional-merge`, starting at `f710bcb`.
Baseline measured here: 74 test files / 414 tests pass; TypeScript and Vite production build pass.
Vite warns about a large admin chunk. The development dependency scan also finds a stale
`JobComparison` import in the manual-hours preview. Dependencies installed from the lockfile.
Environment files and both input archives are preserved.

## Architecture and preservation matrix

React 18 + TypeScript + Vite, Tailwind semantic tokens, React Query, Luxon (London reporting),
Recharts and Leaflet. Admin routes use query parameters; driver navigation is application state.
Separate cookie sessions protect admin and driver requests. The supplied frontend has a single
admin session gate, not a granular admin permission model. Authorization must remain on the server.
No database models or migrations are included. APIs describe jobs, drivers, evidence, vehicle
records, settings, messages, telemetry and reports. Financial values are predominantly pence;
final charges, recorded receipts, unpaid invoices and manual submissions remain distinct.

| Functional feature | Aurora destination / integration | Protected behavior |
| --- | --- | --- |
| Overview, finance summary | Operations command center | Range jobs, status totals, known subtotals, partial coverage, London dates |
| Active / finished jobs | Jobs and Completed filter | Search, server paging/sorting, CSV, bulk delete/reassign, detail overlay |
| Create booking | Jobs toolbar and accessible form | Existing POST /api/admin/jobs contract and confirmation flag |
| Job detail / submission review | Details, Timeline, Charges, Activity | Reassign, manual finish, review, evidence removal, PDF, raw booking data |
| Driver directory / accounts | Drivers / Directory | Create/edit/deactivate/delete, same roster and endpoints |
| Driver breakdown / settlement | Drivers / Performance; report Payments | Existing report calculations, reconciliation, missing-data distinctions |
| Driver reports | Summary, Jobs & timings, Payments, Road charges | Date range, paging, report download, GPS/manual comparisons |
| Live fleet / road alerts | Live fleet, Alerts / Fleet events | Tracker freshness, locations, job links, dismissals |
| Van mileage/fuel/service/compliance | Vehicles and detail drawer | Records, receipts, compliance dates, existing due thresholds |
| Storage check-in/out, parking, liability | Liability & checks tabs | Scenario APIs, photos, signature, PDF/CSV and category configuration |
| Notifications / messaging | Alerts / Delivery log; Settings | Event data, dismissals, templates, broadcast, push settings |
| Pricing / API settings | Settings tabs | Same persistence APIs, partial save handling, guarded editor navigation |
| Factory reset | Maintenance | Existing confirmation and API; never executed during this work |
| Driver authentication/profile | Existing driver screens | Login/logout/reset, profile uploads and validation |
| Driver job workflow | Existing workflow screens | Steps, calculations, GPS arrival, photos, signatures, manual hours, liability |
| Driver van and pending work | Existing van/pending screens | Fuel/service uploads, pending submissions and retry |
| PWA / offline / notifications | Existing shared services | Outbox, service worker, cache controls, install, update and notification flows |

The reference already includes the premium sidebar, frosted header, light/midnight tokens,
radial analytics, charts, responsive tables and motion preferences. These are retained rather
than replaced. API-client comparison found no removed operational API calls in consolidated
pages: the old `fetchSummary` was replaced by explicit range calculations, and the old
`triggerDatasetRefresh` was itself a no-op; refresh now refetches queries.

## Integration plan

1. Repair verified broken status drill-downs and restore reachable job creation.
2. Protect asynchronous list state and booking submission, retain existing payload meanings.
3. Repair shared modal keyboard/focus handling and admin request/session recovery.
4. Repair dev preview, run regression/build checks, inspect rendered routes against Aurora.
5. Record exact verified behavior and externally blocked scenarios below.

## Verification and remaining scope

In progress. Production backend, server authorization, real Calendar creation, email/SMS/push
delivery, database concurrency and real device GPS/camera behavior cannot be certified with
this frontend-only repository. Test fixtures will be used only in tests/development; production
data must continue to come from the existing APIs. No new business rules or schema changes.
