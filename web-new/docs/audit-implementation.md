# TMV dashboard redesign — audit implementation checklist

Source: `TMV_Dashboard_UI_UX_Audit.pdf` (13 Oct 2026). Branch: `redesign/audit-implementation`.
Status key: **Planned** → **Done** / **Blocked (dependency)** / **Partial**.
This file is updated as work lands; the final status table is the handoff record.

## Baseline (before changes)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `vitest run` | 77 files, 384 tests pass |
| `vite build` | pass |
| Lint | no lint script configured in `package.json` |

Backend: not in this repository (separate Mongo/Express service behind `/api`). All
verification uses the in-repo dev mock API (`VITE_MOCK_API`), never the deployed backend.

## Data-definition map (traced from source)

| UI concept | Field | Meaning established from code | Confidence |
| --- | --- | --- | --- |
| Calculated charge | `job.totalCharges` / `finance.systemCalculatedPence` | System-priced total (base + extras + overtime + road fees) | High |
| Final charge | `job.amountCharged` / `finance.acceptedPence` | Amount entered by the driver at completion (`total_charges` workflow step); differs from calculated when an adjustment note exists | High |
| Recorded receipts | `finance.systemPayments.collectedPence` (excl. Invoice/Unknown) | Payments recorded in the job flow by method | High |
| Unpaid invoice | `systemPayments.byMethod.Invoice` | Amount left to invoice at completion (driver form sets Invoice = final charge − recorded) | High |
| Driver-reported amount | `finance.manualPayments.collectedPence` / `manualDetails.amountCollectedPence` | Driver's post-job manual submission; `null` = not submitted | High |
| "Driver Collected" (old label) | `paymentCards.driverCollectionPence` = Σ acceptedPence | **Final charge**, not money received — includes unpaid invoices | High (defect) |
| "Outstanding" (old label) | `paymentCards.outstandingPence` | Final charge − driver-reported amount = reconciliation difference, not customer debt | High (defect) |
| Overview "Gross Revenue" | `kpis.revenuePounds` (server) | Server-computed; chart subtitle says "Daily billed move turnover" | Medium — basis not verifiable without backend |
| Overview Cash / Card-bank | `kpis.cashCollectedPounds`, `kpis.cardBankPounds` | Receipts by method; do not sum to revenue | Medium |
| Drivers "Revenue Handled" / Breakdown "Driver Collected" | `DriverSummaryItem.revenuePounds` | Presented in the Breakdown with the same label as the report's final charge | Medium — needs backend confirmation |
| Calendar duration | `timeBilling.scheduledMinutes` | Billing input labelled "Original Calendar duration"; compared to event length (`bookedFinish − bookedStart`) and booking-text hire duration | Medium |
| Allocation | `timeBilling.allocatedMinutes` | Allowance before extra time is billed | Medium |
| Arrival delay | `delayMinutes`, `arrivalDelaySource` | Only trustworthy when source is `gps-two-fresh-reports` | High |
| Vehicle date state | `daysUntil(date)` vs `COMPLIANCE_ALERT_DAYS = 30` | Existing rule in `VanMileagePage` | High |
| Service due | `SERVICE_MILEAGE_WARNING_MILES = 500` | Existing rule | High |
| Tracker freshness | `STALE_AFTER_MINUTES = 30` | Existing rule in `LiveFleetMap` | High |

## Confirmed defects (reproduced from source)

1. Command palette filters page names only; placeholder promises jobs/customers/postcodes.
2. Palette "Finance" → `section=finance` renders nothing (no page mounted).
3. Palette "Export Jobs to CSV" has no handler (`onExportCsv` never passed); "Sync Live Sheets Data" is a no-op.
4. `LiveFleetPage` ignores the job ID from `onSelectJob`.
5. Opening a driver report force-collapses the sidebar (`Layout` effect).
6. `formatDuration` renders fractional minutes (`3h 43.88m`); driver cards render `+-3 mins`.
7. Report "Driver Collected" = final charge incl. unpaid invoices; "Outstanding" = final − driver-reported.
8. `DriverRoadAlerts` drops unlinked events after server pagination (count ≠ rows).
9. `ScenariosPage` pagination renders "Showing 1-0 of 0 records".
10. `ParkingLiabilityPage` slices an already server-paginated page (page ≥ 2 always empty).
11. `ScenariosPage` hardcodes real people's names for driver mapping.
12. Pricing discard resets to the pre-save baseline; sequential save failure leaves saved keys marked dirty.
13. Jobs list (`q`) and Finished list (`search`) send different search parameters.
14. Van compliance shows "Recorded" for an overdue date.
15. Live Fleet "Parked" means "signal older than 30 min" (freshness conflated with motion); fetch failure shows "Waiting for telemetry" indefinitely.
16. Jobs view-toggle buttons have no accessible names.

## Recommendation checklist

| # | Audit recommendation | Screen / component | Planned change | Verification | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Eight destinations with new names | `Layout`, `AdminApp` | Overview, Jobs, Drivers, Live Fleet, Vehicles, Evidence & Liability, Alerts, Settings; legacy `section` values redirect | Routing unit tests | Done |
| 2 | Finished = Jobs filter | `AdminApp`, Jobs | `section=finished` → Jobs with Completed filter | Routing test | Done |
| 3 | Repair search / remove dead Finance | `CommandPalette` | Server job search (existing `q`) + Jump to page; no dead entries | Palette tests | Done |
| 4 | Preserve sidebar preference | `Layout` | Remove auto-collapse; persist preference | Layout test | Done |
| 5 | Breadcrumb / back controls | `PageHeader`, report | Drivers / Name / Tab breadcrumb | Visual | Done |
| 6 | Return preserves context | Global job drawer | Job opens over current page via `job` param; close restores | Navigation tests | Done |
| 7 | Date & time format, London tz | `utils/format` | 13 Oct 2026, 24h, "London time" scope labels | Unit tests | Done |
| 8 | Shared components | `components/ds/*` | PageHeader, Toolbar, StatusBadge, MetricRow, CoverageNotice, DataState, Pagination, Drawer, Tabs, ExportMenu, SaveBar | Used across pages | Done |
| 9 | Overview: work first | `OverviewPage` | Four metrics, Needs attention, Today's jobs, compact Daily billed revenue | Tests + visual | Done |
| 10 | Explain money basis / status counts | `OverviewPage` | Status counts reconcile to total; receipts shown as separate measure | Unit test | Done |
| 11 | Ranking clarity | Overview → Drivers | Top Drivers removed from Overview; ranking lives in Performance summary | Visual | Done |
| 12 | Driver Breakdown → Drivers / Performance summary | `DriversPage` | Directory + Performance views; plain financial labels; View report primary action | Tests | Done |
| 13 | Jobs compact list default | `JobsPage` | Table default; cards optional with named toggles | Tests | Done |
| 14 | Replace calendar shorthand | Jobs list | Crew, route, schedule as fields; raw title in detail only | Visual | Done |
| 15 | One amount, clear meaning | Jobs list | "Final charge" column; Not recorded vs £0.00 | Unit test | Done |
| 16 | Separate status dimensions | Jobs list + detail | Job / payment / evidence / viewed / review shown independently | Visual | Done |
| 17 | Canonical job detail | `JobDetailDrawer` | Header + tabs: Details, Timeline & evidence, Charges & payment, Activity; replaces Finished drawer | Tests | Done |
| 18 | 90 vs 120 minute labels | `JobTimeBreakdown` | Calendar event length vs billing input vs booking text; no "original" for transformed values | Unit test | Done |
| 19 | Safe operational actions | Job detail | Reassign / Mark finished / delete photo separated in a More menu; reason required | Visual | Done |
| 20 | Four report tabs + legacy links | `DriverReportView/Page` | Summary, Jobs & timings, Payments, Road charges; legacy `reportTab` values mapped | Tests | Done |
| 21 | Compact report header | Report | Identity + range + export in one header; email moved to profile | Visual | Done |
| 22 | Missing GPS context | Report | "Movement data unavailable for N jobs" with Retry | Test | Done |
| 23 | Name delay measure | Report | "Total arrival delay (sum)" | Test | Done |
| 24 | Payment definitions | Payments tab | Final charges, Recorded receipts, Unpaid invoices, Driver-reported; Known subtotal + coverage | Tests | Done |
| 25 | Remove unlabeled donut | Payments | Labeled method table | Visual | Done |
| 26 | Reconciliation mode | Payments | Exception-first list across full range (with coverage note), aligned comparison | Tests | Done |
| 27 | Road charges combined | `DriverRoadAlerts` | All/Tunnel/Congestion; unlinked shown as Needs job match; rules disclosure | Tests | Done |
| 28 | Evidence & Liability around the job | `LiabilityPage` | Shared toolbar/list, Signature status, job link, fixed pagination | Tests | Done |
| 29 | Vehicles: registration first, due states | `VanMileagePage` | Current/Due soon/Overdue/Date missing; history range only in detail | Tests | Done |
| 30 | Alerts: needs attention first | `NotificationsAlertsPage` | Needs attention / Fleet events / Delivery log; device setup → Settings; bell uses same source | Tests | Done |
| 31 | Live Fleet freshness + exact job | `LiveFleetMap/Page` | Freshness badge, last-known motion, exact job drawer, provider control removed, error state | Tests | Done |
| 32 | Settings: compact pricing + honest save | `PricingSettingsPage` | Grouped tables, units, per-field outcomes, baseline refresh, unsaved guard | Tests | Done |
| 33 | Message templates | `MessagingPage` | Enabled state, preview, variable validation, HTML as advanced | Tests | Done |
| 34 | Responsive & accessibility | All | 390/768/1366/wide checks; names, focus, dialogs | Visual + tests | Done (see note: focus after closing a job opened from search returns to the page body, not the search button) |
| 35 | Loading / empty / error / partial | `DataState` | Shared states across data surfaces | Tests | Done |
| 36 | Export scope | Exports | Scope labels on every export control | Visual | Done |

## Implementation notes

Component names in the table are the planned targets. Where a legacy component was replaced, the work lives in:
`pages/EvidencePage.tsx` (was LiabilityPage, ScenariosPage, ParkingLiabilityPage), `pages/VehiclesPage.tsx` (was VanMileagePage),
`pages/AlertsCenterPage.tsx` (was NotificationsAlertsPage, NotificationsPage, AlertsPage), `pages/SettingsPage.tsx` with `components/settings/*`
(was ConfigurationsPage, PricingSettingsPage, MessagingPage, ApiSettingsPage), and `components/report/RoadChargesTab.tsx` (was DriverRoadAlerts).

## Verification (2026-10-14)

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: 71 files, 376 tests, all passing (baseline: 77 files / 384 tests; legacy-UI tests were replaced by tests of the new behaviour).
- `npx vite build`: succeeds; mock fixtures are not in the production bundle.
- No lint script exists in `package.json`, so no lint run.
- Visual QA used the in-repo dev mock API with sanitised fixtures (`src/mocks/admin.ts`), the proxy pointed at a dead local port, and no request reached a real backend.
  Checked at 390, 768, 1366 and 2560 px; no page scrolls horizontally at 390 or 768.
- Before/after screenshots were taken of Overview, Jobs, Driver report (Payments), Settings and Vehicles against the baseline commit with the same fixtures.
