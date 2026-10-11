# Phase 6: Driver Report API and Reconciliation

Date: 2026-10-09. Status: implemented and tested locally. No release or production-data processing occurred.

## Delivered

The shared driver report now supplies financial/performance summaries, daily/weekly/monthly trends, per-job system/manual comparison data, GPS visits/events/charge verification, recorded movement coverage, job/context links and isolated liability evidence/totals. It is a read-only foundation for Phase 7 and Phase 8, not the redesigned full-page UI or complete PDF/Excel export.

Financial aggregates are calculated from every matching job before detail pagination. An oversized financial/source range fails explicitly instead of presenting a truncated page as a complete total. GPS/provider completeness remains a separate unknown/partial dimension.

## API Contract

Mounted behind existing admin authentication:

```text
GET /api/admin/driver-reports/:initials
    ?from=2026-10-05&to=2026-10-11&groupBy=day&pageSize=50
```

- Initials: 1-24 letters/digits/underscore/hyphen, normalized uppercase.
- Date-only filters use Europe/London midnight; the selected end date is included by converting it to the next local midnight exclusive. Explicit timestamps require offsets and use an exclusive end. Maximum range is 366 days.
- `groupBy`: day, week or month. Weekly trends start on Monday in London.
- `page`: default page for details. `jobsPage`, `eventsPage`, `visitsPage`, `chargesPage` and `liabilitiesPage` independently override it. Page size 1-200, default 50.
- Invalid range/page/reference returns 400; source capacity returns 413; read failures return 500 rather than invented zero totals. Empty valid reports return empty lists with coverage/account metadata.

The versioned response contains `driver`, `range`, `dateBasis`, `summary`, `trends`, paginated `jobs/events/visits/charges/liabilities`, `contextJobs`, `gpsSummary`, `liabilitySummary` and `meta`. Money fields use integer pence; nullable fields mean unknown. Durations use labelled minutes/seconds/hours. Pagination changes lists, not their underlying summary totals.

Per-job details include original snapshotted Calendar/allocated times, actual/manual minutes, helper/manual record, price adjustment reason, recorded split receipts, recognized collections, signed difference, positive outstanding, excess, method differences, review outcome, movement evidence and road-charge assessment.

## Reconciliation Basis

```text
effectiveExpected = saved system calculation, or the documented accepted adjusted price
recognizedCollection = known driver manual receipts + confirmed separate prepayments
signedDifference = effectiveExpected - recognizedCollection
outstanding = max(0, signedDifference)
excessCollection = max(0, -signedDifference)
```

- Expected GBP 250, manual GBP 220, no unresolved prepaid provenance: GBP 30 outstanding.
- Expected GBP 250, manual GBP 280: GBP 30 excess.
- One job GBP 30 short and another GBP 30 over: show GBP 30 outstanding AND GBP 30 excess, not a net zero balance.
- Missing manual submission: pending; outstanding and manual work time remain unknown.
- Same total but Cash versus Card: a method discrepancy remains even when the amount difference is zero.
- A recorded discount reason preserves the accepted adjusted price while retaining the original automatic calculation. Explicit zero/free adjusted totals remain zero across summaries/drawers/prints, never falling back to the original positive total.
- Confirmed separate prepaid GBP 100 plus manual GBP 150 against GBP 250: zero remaining. An explicitly included prepayment is not added again.
- `paidOnline` alone proves no receipt. If the balance depends on unresolved online/prepaid provenance, outstanding stays unknown and the known-only calculation gap is exposed separately. No missing prepaid amount is guessed.
- Reused/conflicting prepayment references, including another job outside the selected report, require verification. No new prepayment intake/integration endpoint was added; this is a typed read contract for approved recorded data.
- Congestion/tunnel fees already included in the saved job price are components, not amounts to add again. Road expectations remain the separate Phase 4 comparison view.
- Report discrepancies are review signals, not proof of fraud or a automatically assigned driver/customer debt.

## Shared Receipt Accounting

The same receipt categorization is used by the new report and existing normalized Settlement, Overview and Finance consumers. Each split row contributes its own amount; a combined label never allocates the entire bill to Cash. Link and Bank Transfer are explicit received methods. Invoice amounts are uncollected, and Invoice/Transfer or malformed methods remain ambiguous.

Legacy fallback requires an explicit paid/received/collected status and an unambiguous method. A generated link, job price or booking confirmation cannot become a guessed receipt. System invoice rows with a zero placeholder can expose the remaining saved bill as a labelled derived invoice balance; an explicit manual zero invoice is not changed.

Existing revenue/billed-price fields remain distinct from `totalCollectionsPounds`/known receipts. Existing settlement CSV and print columns now include Link and Invoice Pending. Print collections exclude invoices, and working duration is not called GPS moving time.

Historic extra fees without a saved charge/tariff snapshot are unknown, not repriced using today's settings. Compatibility numeric fields are known subtotals; nullable `roadFeeAmounts` and per-driver unknown counts carry the missing portion. Settlement CSV/print/table renders Unknown or a labelled partial known subtotal. New report full totals are nullable where data cannot be reconciled; partial/unknown counts accompany all known aggregates.

## Ownership and Dates

- Financial/performance cohorts use a recorded operational start; completion fallback dates use booking date. Recorded timestamps require explicit offsets in the new report. Rows without a usable operational date cannot be assigned to a date-filtered cohort.
- New driver/admin completions capture report identity. Calendar sync retains it and prepayment metadata. Existing billing or locked manual identity is preferred over mutable job assignment; legacy assignment/current roster names remain labelled by provenance.
- Original Calendar terms come from the billing snapshot after later Calendar edits. Accepted totals and frozen rates are never recomputed by report generation.
- GPS entries/crossings use occurrence time. Historical IMEI/job association includes other same-device jobs for ambiguity checks; provider/raw-event receipts do not define activity dates.
- Liabilities use approved incident time, else labelled submission time. Saved audit-date records are retained when a source changes or disappears, with review issues. Liability amounts never join customer collections or road-fee sums.
- Linked jobs outside the financial cohort are context only. They are navigable but not added to financial/job-performance totals again. Job working/moving trends share the operational cohort; raw GPS counters use occurrence scope independently.
- Existing weekly/Finance/Settlement date filters keep inclusive ends, now compare converted instants rather than mixed-offset strings, and use London boundaries for date-only values. The new API explicitly declares exclusive timestamp ends; future clients must honor that contract.
- Helper grouping is optional driver-reported free text, not verified employee identity or payroll allocation.

## Bounds, Caching and Coverage

Financial jobs and context/source/audit reads are bounded at 5,000 rows; at most 50 historical trackers. Road-allocation reads cap 5,000 ledgers/50,000 rows. Exceeding these bounds rejects the report and asks for a narrower range; monetary totals are not silently truncated.

The existing GPS read layer caps each events/positions/drives dataset at 20,000 and run metadata at 100. Truncation yields Partial GPS coverage while the independent financial job cohort remains complete. GPS list totals/counts are observed scope, not a provider completeness guarantee. Moving time has unknown/partial job counts; no tracker never becomes a claimed zero actual movement. Real portal geometry remains required for confirmed tunnels.

Identical concurrent report reads are single-flighted. No completed report is cached across requests, so writes need no report-cache invalidation hook: the next completed-request cycle rereads source data. Reads are nontransactional and can span concurrent updates; this is exposed in metadata, not described as a database snapshot guarantee.

## Local Verification

- Final full backend regression: 450 tests passed across 43 files.
- Frontend checks: 16 tests passed across five files, including settlement receipt printing, unknown/zero subtotals, Overview, job report and archive regressions.
- Backend and web TypeScript/production builds passed. Existing large-chunk web build warnings remain; no unrelated dependency/refactoring work was performed.
- `git diff --check` passed with Windows line-ending warnings only.
- Tests cover split methods/invoices/Link, unknown receipts, missing manual entries, partial collections, excess, no cross-job netting, documented/zero adjustments, prepayment duplicates/overlap/provenance, frozen Calendar/identity, helper/working hours, UTC/London/DST date filters, query scope/capacity, complete range/detail/trend sums, missing audit sources, empty/error/partial states and safe integer sums.

Database/provider/storage calls are mocked in local tests. Mongo aggregation shapes are inspected but were not executed against a live test database. Full HTTP/auth integration, representative database load, real GPS/portal validation and complete individual exports remain release/integration work.

No backend server was started, live source import/provider write was executed, environment file edited, or code pushed/committed/deployed. A frontend-only Vite preview was started at port 5178 with synthetic data and no API/auth/provider calls.

## Review Checkpoint

Open [the isolated settlement preview](http://127.0.0.1:5178/phase6-check.html): Cash GBP 100 + Card GBP 50 + Link GBP 50 = GBP 200 collected; Invoice GBP 100 remains pending, and the billed price GBP 300 is separate. Browser verification covered 1280x900 desktop and 390x844 mobile. The print fixture intentionally uses horizontal scrolling on mobile; it is not the Phase 7 responsive dashboard.

Review the outstanding/prepayment/unknown examples above before authorizing Phase 7. Keep D07 intake/editing disabled. Before release, exercise the authenticated API and queries in an isolated test database, verify historical ownership/range/unknown labels with representative data, and complete Phase 9 migration/deletion checks. No production backfill or external monetary action is authorized implicitly.
