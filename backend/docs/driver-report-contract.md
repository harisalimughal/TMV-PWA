# Driver Report Contract and Migration Baseline

Phase 0 design, 2026-10-09. These contracts are for subsequent implementation; no endpoints or database writes are activated by this document. Phase 0 monetary policy decisions are recorded in plan.md.

## API Shape

All endpoints below require the existing admin session. Driver submissions use the existing authenticated, job-ownership-checked endpoint. Reject invalid dates and inverted ranges; validate a bounded report range, with the bound enforced identically for UI and exports.

| Endpoint | Output |
| --- | --- |
| GET /api/admin/drivers/:initials/report?from=&to=&groupBy=day | Versioned identity, scope, summary, performance, finance, charts, comparison counts, GPS coverage, and charge/liability counters |
| GET /api/admin/drivers/:initials/report/jobs?from=&to=&page=&pageSize= | Paginated job history with system billing snapshot, locked manual details, and linked event/obligation/liability IDs |
| GET /api/admin/drivers/:initials/report/events?from=&to=&scheme=&page=&pageSize= | GPS events/visits/passages, evidence, coverage, job association and verification state |
| GET /api/admin/drivers/:initials/report/liabilities?from=&to=&page=&pageSize= | Structured driver/job incidents, amounts, evidence and reported/verified statuses |
| GET /api/admin/drivers/:initials/report/export.pdf?from=&to= | Complete PDF using the same report calculation and scope |
| GET /api/admin/drivers/:initials/report/export.xlsx?from=&to= | Complete XLSX using the same report calculation and scope |
| POST /api/jobs/:jobId/driver-summary | Extend existing one-submission endpoint with versioned manual charge items and separate payment methods; preserve old schema reads |

Use operational London dates for presets and convert to UTC range boundaries. Retain existing booked-start scoping for jobs unless changed explicitly by the client. Events use occurrence time; liabilities use incident date. Jobs linked to in-range events outside the job date range appear as context, without being added to job financial totals twice. Customer charge windows use Europe/London, with start boundaries included and end boundaries excluded.

Job-linked road activity only (confirmed by the user 2026-10-11): every visible tunnel/congestion record must have a real job association belonging to the report's historical driver scope. Exclude unlinked or ambiguous activity before counts, charges, totals, trend calculations and pagination. This applies equally to summary cards, comparisons, job views, tunnel/congestion tabs, dialogs and PDF/Excel exports. Internal GPS source retention for future matching does not make a record reportable. Keep out-of-window activity only when it is job-linked, with zero applicable customer fee.

Range-stable alert projection: missing zone exits must not merge display entries across different jobs or London calendar days and hide later activity. Keep overlapping sectors grouped within a job/day and same-time duplicate records grouped together. Each row's zone names and source records belong only to its interval. A wider range should retain the matching Today entries; this display segmentation does not certify physical crossings or rewrite saved prices/GPS source data.

## Required Response Fields

### Progressive Breakdown Reads (2026-10-11)

The implemented GET `/api/admin/driver-reports/:initials` endpoint accepts `detail=core|full` (default full). Both display modes omit unused liability reads; `meta.liabilitiesIncluded=false` and an unknown complete liability total distinguish omission from a confirmed empty ledger. Complete PDF/XLSX exports still use a fresh full service report including liabilities and GPS.

`detail=core` returns scoped jobs, timings, financial totals, manual comparisons and job-derived trends without GPS/provider/road-allocation reads. `meta.gpsIncluded=false` and `gpsSummary.coverage=not-requested` explicitly mark deferred data. Empty GPS lists in this response are placeholders, not confirmed zero activity. The page shows loading/unavailable states for pending road/movement sections rather than presenting those placeholders as counts or fees.

The page renders basic data first and requests full movement/road details in the background. Performance charts are separately code-split with a loader. Background failures leave basic data visible and provide a separate retry; a new driver/date range does not inherit old-range totals. Report cache entries include GPS/liability inclusion flags, and complete exports bypass display caches.

Full report GPS reads run concurrently and transfer compact position/run metadata plus one newest usable zone snapshot within the unchanged 100-run window. Normal GPS monitoring retains its complete metadata. Provider alert requests use historical tracker scope when every relevant started job has a recorded device; legacy unpinned jobs retain the fleet fallback. Capacity bounds, partial-coverage flags, job association, prices and charging rules are unchanged.

`schemaVersion: 1`, `generatedAt`, `driver`, `scope`, `performance`, `finance`, `charts`, `verification`, and `coverage` are required in the summary response. Missing numeric data is `null`, accompanied by coverage/reason; do not substitute zero.

| Object | Required Data |
| --- | --- |
| driver | Historical/current display identity: initials, name, stable account reference where available; current vehicle is labelled current, not used to rewrite event attribution |
| scope | UTC from/to, timezone Europe/London, grouping day/week, booked-start job basis, occurrence-time event basis, incident-date liability basis |
| performance | assigned/completed/cancelled counts, scheduled/allocated/working minutes, GPS moving/travel/idle minutes where supported, actual/billed overtime, arrival delay statistics, review email sent/not-sent, manual driver/helper totals and submission coverage |
| finance | expected system total, adjusted customer total and reasons, system-recorded receipts, manual collections, independently confirmed prepayments, outstanding, excess, signed differences, per-method amounts including ambiguous legacy method, base/overtime/customer extra components, expected road costs separately, missing-rate/prepayment coverage |
| charts | Revenue/collections and job-count timeline; duration/overtime/moving timeline; payment method split; delay/review/verification timeline; every point uses the shared aggregation |
| verification | Per-job discrepancy counts and reasons: missing summary, missing charge, fee mismatch, method mismatch, collection mismatch, duplicate allocation, unknown road tariff/zone/direction, missing GPS, ambiguous job attribution |
| coverage | complete/partial/unavailable by jobs, summaries, rate inputs, prepayments, GPS movement, crossings, liabilities; reasons, checked window and provider source |
| pagination | page, pageSize, total, totalPages, hasMore on each list; exports bypass the list page limit |

A job row includes job ID, customer/route fields under admin authorization, status, driver/vehicle-at-time, Calendar duration, allocated duration, actual boundaries/duration and provenance, billing snapshot version/rate/blocks/amount, payment breakdown/status, locked manual record/version, reviews, charge allocations, liability references and evidence links. Overtime rate priority is Calendar rate first; if missing/unusable, read Pricing Settings `OVERTIME_RATE_PER_30`; if that is blank, use the existing crew/packing rate fallback. Any positive partial extra-time block rounds up to a full 30-minute block, and the snapshot labels the applied rate source.

A manual record includes job ID, submitter, submission time, version, edited start/end, helper name/hours, per-method collected amounts for that job, and individual tunnel/congestion/other customer fees. Amounts embedded in the manual total must not be added again as extra collections. Old Invoice/Transfer stays combined/unknown until independent evidence supports classification.

## GPS, Obligation and Liability Records

| Record | Fields and Semantics |
| --- | --- |
| GPS event | provider, provider event ID if present, device ID, event/received UTC instants, original timestamp/timezone interpretation, zone ID/name/scheme, entry/exit/type, coordinates/speed/direction where present, raw source reference, historical driver/job link and confidence |
| Zone visit | physical vehicle/scheme, source entry/exit IDs, entry/exit instants, overlapping polygon IDs, observed versus inferred start, time inside or null, movement/coverage evidence, affected jobs |
| Tunnel passage | stable reconstructed passage ID, scheme/tunnel name or unknown, direction or unknown, associated route/event evidence, occurrence time, confirmation/coverage state |
| Road obligation | scheme + physical vehicle + London date for congestion, or scheme + vehicle + confirmed passage ID for tunnels; rate/rule version, class/account/exemption/direction evidence, expected road cost or null |
| Customer fee allocation | obligation reference, job/driver context, customer policy/rate snapshot and pence amount; congestion applies to the job if the driver enters the zone during that job within the approved chargeable schedule; tunnel applies per confirmed chargeable crossing associated with the job |
| Liability | stable ID, source scenario/reference, incident date, job/driver-at-time, type, description, amount if present from an approved non-driver source, evidence, payment/resolution status if available, provenance and audit events |

GPS collection/passage evidence does not prove a customer paid a fee. Mark charge differences as requiring verification; do not automatically assign fraud, fines, or debt. Driver-entered parking/liability amounts are out of scope for this increment; existing liability and parking submissions remain evidence-only unless an amount/status already exists from another approved source.

## Migration and Activation

1. Add optional versioned fields/collections. Keep old pounds-valued Job fields readable through the existing money conversion boundary; new billing snapshots and charge ledgers use integer pence.
2. Use explicit future billing-rule and mandatory-summary activation dates. Audit found 228 completed jobs and zero manual summaries, so historical missing summaries must not block every driver's next job.
3. Freeze booking/rate/customer-fee inputs at the accepted operational boundary. Existing Calendar sync refreshes extraChargeText, and dashboard normalization reads today's fee settings; both must stop silently repricing snapshotted jobs.
4. Read old completed jobs using their saved totals and source labels. Do not recompute historical prices or create invented manual details/crossings. Any optional history recalculation is a separately authorized, reviewable import.
5. Ensure booking sync upserts preserve newly added optional snapshots; a known-field object rebuild must not drop them. Preserve driver/vehicle history across reassignment and van swaps.
6. Unique indexes: manual job ID, provider/event ID, passage key, obligation key, allocation obligation/job key, liability source reference. Claim writes atomically; support safe duplicate retry behavior.
7. Raw GPS events remain independent of notification suppression. Event timestamps, not receipt day or current active job, control attribution and charging.
8. Fetch bounded history windows with checkpoints and overlap deduplication. At requested alert limit, split windows; if the smallest window remains capped or data is missing, mark coverage partial. No published pagination/retention guarantee was found in the inspected provider schema.
9. Existing first-entry flags migrate as limited legacy evidence, not complete history. Empty trips/provider outages never establish zero crossings. Retain unlinked source records internally for possible matching, but exclude them from all driver/job road-activity reporting and exports. Unknown attributes of an already job-linked record may require verification without removing the valid job link.
10. Update job deletion/factory-reset handling for new records before activation. Current handlers do not include driver summaries. Preserve shared vehicle/day evidence when one associated job is removed; prevent orphan references and avoid deleting another job's allocation. Do not run destructive maintenance as part of this feature audit.
11. Add bounded indexes/caching and invalidate report aggregates after relevant job, manual, event, fee and liability writes. Keep report generation independent of live notification and Calendar-sync side effects.
12. Use the same versioned report service for summary/detail/PDF/XLSX totals. A release requires tested migration defaults and the user's explicit push/deploy instruction.

## Fixture Contract

### Finished-Job Reporting Scope

Recorded road-charge summary values are available subtotals: they sum non-null saved fee amounts across completed jobs and retain separate congestionUnknownJobs/tunnelUnknownJobs counts. A missing fee does not hide other recorded amounts. An explicit saved zero counts as known; null is returned only when every completed job lacks that fee amount. Empty cohorts retain zero aggregates and the UI's finished-job empty state. Individual missing fees remain null, and current settings/GPS estimates never replace missing historical billed amounts. The UI displays unavailable-job counts in red beneath the available subtotal.

Driver Breakdown requests `completedOnly=1` from the driver summary endpoint; the operational Drivers summary retains its existing all-status behavior and a separate cache entry. Detailed reports and exports load only COMPLETED jobs for their financial/date cohort, before row limits. GPS road activity is shown only when linked to a COMPLETED job; unfinished contextual jobs remain available internally for ambiguity checks, never as report records or charge contributors. Completed contextual jobs retain occurrence-date filtering for road evidence. Liability exports exclude unfinished-job records; the separate operational liability module is unchanged.

When the selected financial cohort has no finished jobs, every report tab shows `No finished job data`, retains driver/date controls, and does not start background GPS/road-history/chart loading. Breakdown summary rows with no completed jobs are hidden, but registered drivers remain selectable.

`backend/test/fixtures/phase0-cases.json` contains the six client billing examples, three anonymized recorded durations, financial cases, GPS cases and liability cases. All IDs/device labels are synthetic. No credentials, customer details, plates, IMEIs, locations, or actual job IDs are stored.

The six accepted duration examples and recorded-duration cases are executed against the current standalone calculator. Other fixture outcomes are acceptance specifications for phases 2-6 and must be tested against the implemented engines later. Proposed financial boundary/allocation outcomes remain dependent on the decision register; creating a fixture does not approve that policy.
