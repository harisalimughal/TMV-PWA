# Phase 7: Driver Reports Dashboard

Date: 2026-10-10. Status: implemented and verified locally; client acceptance and real-data integration remain pending. Nothing was released.

## Delivered

- Overview's congested inline Work Breakdown and comparison are replaced by a concise Driver Settlement summary. Each driver has report and compare actions. The existing Drivers roster opens the same report without removing its management/contact controls.
- A dedicated full-page report presents driver identity, retained range and seven views: Performance, Payments, Comparison, Jobs, Tunnel Charges, Congestion Charges, Penalties & Liabilities.
- Summary values and trends come from the Phase 6 API, not client-side recalculation of job charges. Monetary unknowns, unpaid invoices, missing manual entries and incomplete GPS stay explicit.
- Performance covers completed jobs, billed revenue, recorded working/moving time, overtime, delays, reviews and optional manual helper totals. Revenue/jobs/work/moving/overtime series can be selected; aggregation is daily, weekly or monthly. Payment distribution excludes unpaid invoices.
- System/manual comparison has paired aligned fields and a vertical separator on desktop, labelled stacked sides on mobile, selected-range totals, per-job signed difference/outstanding/excess, payment-method/time highlights, pending submissions and locked details. Jobs expand individually.
- Job history includes original Calendar/allocation/actual/overtime, customer/route, receipts, prices, adjustment reasons, review status, GPS activity and linked liability evidence.
- GPS sections show observed versus inferred visits, confirmed crossings, timestamps, known duration, scheme/name/direction, qualifying customer obligations, expected amounts and unknown authority costs. Raw-event coordinates appear where available. Geofence entry is never labelled a confirmed physical tunnel crossing.
- Incident records retain job links, type/description/date/basis, source/reference, status/responsibility, unknown amounts and supplied photos/signatures. Notices/risk evidence are not presented as confirmed fines. No driver/admin amount intake or locked-manual editing was added.

Complete individual PDF/Excel downloads remain Phase 8. No fake/dead export controls were introduced.

## Navigation and Filters

Reports use:

```text
/admin?section=driverreport&driver=AB&reportTab=comparison&from=2026-10-05&to=2026-10-11
```

Driver, dates, tab, trend grouping and separate jobs/events/visits/charges/liabilities pages live in the URL. Popstate restores them; job detail navigation retains the report context for browser Back. Summary/roster date selections are also retained in their own URLs.

Shared filters now support Today, Yesterday, Tomorrow, 7 Days, This Week, This Month, Last Month and custom dates. Tomorrow remains for existing workflows. All presets use London calendar boundaries, with seven days including today and Monday-based weeks. The report client adapts inclusive UI timestamp ends to the Phase 6 exclusive-end API contract.

The backend now accepts `activityScheme=all|tunnel|congestion`. Visits, events and obligations are filtered before pagination; financial cohort totals remain unchanged. Scheme totals therefore do not come from just the displayed page or from another charge scheme.

Charge and job-liability details are fetched only when their evidence disclosure is opened. These are GET/read operations, not reconciliation or editing actions. Unknown/partial authority/provider data remains unverified.

## UI and Accessibility

- Restrained TMV branding, compact heading, white metrics and unframed section bands; no landing-page hero or invented driver score.
- Fixed chart heights and responsive grids; larger monetary strings use length-based sizing rather than viewport-scaled type.
- Native disclosures, labelled controls, icon-button names/tooltips, focus outlines, keyboard Left/Right/Home/End tab selection, touch-sized navigation and accessible tab panels.
- Trend values are available in a table as well as the interactive chart. An entirely missing moving-time series renders Unavailable rather than a zero line.
- Comparison fields use shared grid rows so matching fields align even when text wraps. Mobile removes the side divider and stacks labelled sections.
- Wider evidence/financial tables scroll inside their section; the page itself was checked for overflow. Actual touch hardware and large real evidence galleries remain integration checks.
- Failure states retain date filters and retry, so an oversized/invalid/outage request does not strand the user.

## Verification

- Complete backend regression: 452 tests passed across 44 files.
- Focused frontend/regression checks: 23 tests passed across six files.
- Backend and frontend TypeScript/build checks passed. Existing web chunk-size warnings remain.
- `git diff --check` passed with Windows line-ending warnings only.
- Tests include paired readonly comparisons, missing submissions, signed differences, full-range versus paginated data, retained URL/job context, popstate, keyboard tabs, failure recovery, optional/unknown liabilities, London/DST date filters and server filtering before pagination.
- Browser inspected synthetic data at 1440x1000 desktop, 768x1000 tablet and 390x844 mobile. Confirmed separate/aligned versus stacked comparison sides, nonblank SVG charts, contained table/tab overflow, long-name wrapping, error controls and missing-GPS moving-time behavior. Temporary viewport overrides were reset.

No backend server or real database/provider import was started. Tests mock integrations; browser preview uses only synthetic records and blocks backend requests. No environment files changed, and nothing was pushed, committed or deployed.

## Client Review

Open [the local report preview](http://127.0.0.1:5179/phase7-check.html).

1. Performance: change the metric and daily/weekly/monthly period; review working versus GPS moving coverage, reviews and helper totals.
2. Comparison: check selected-range totals, the desktop separator, corresponding rows, highlighted differences, locked/pending entries and mobile stacking. Expand a different job or move to the next job page.
3. Payments: verify Cash/Card/Link/Bank remain distinct, invoices are uncollected, and outstanding/excess are separate rather than netted.
4. Jobs: expand a job and open its associated details. In production this uses the existing authenticated Jobs view; the isolated preview substitutes readonly sample detail.
5. Tunnel/Congestion: review separate counts, qualifying obligations, actual expected fee records, evidence notes, pagination and authority-cost unknowns.
6. Liabilities: confirm missing amounts stay Unknown and notices are not treated as fines. New monetary intake and manual edits remain unavailable.
7. Review small widths, long names and the retained date/tab state.

Optional synthetic states can be selected in the preview URL with `mode=nogps`, `mode=empty`, `mode=error` or `mode=long`. These modes do not exist as production report controls.

Before release, validate the authenticated dashboard/API with an isolated test database, real captured photos/signatures, actual tracker/portal data, ownership/range/partial-coverage cases and representative load. Phase 9 release/migration/deletion checks are still required. Next implementation is Phase 8 only after user direction.
