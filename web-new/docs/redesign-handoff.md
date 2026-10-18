> History: handoff written at the end of the Aurora redesign (14 Oct 2026). For the current state
> of the code see `README.md`, `CLAUDE.md` and `docs/MERGE_REPORT.md`.

# Admin dashboard redesign — handover

Branch: `redesign/audit-implementation`. Builds on the audit implementation documented in
`docs/audit-implementation.md`. No deployment was made, and no live data was read or changed:
verification used the dev-only mock API (`src/mocks/admin.ts`) with fictional data.

## What changed

**Visual system** (scoped to the admin; the driver app is unchanged)
- `dashboard/adminTheme.css` overrides the shared colour variables under `html.tmv-admin`, a class
  AdminApp adds while it is mounted (so dialogs in portals inherit it). The admin is light-only.
- Palette: pearl page `#F4F7FC`, white surfaces, navy ink `#14243B`, slate `#53657C`, royal blue
  `#315EED`, borders `#DEE6F1`. Text contrast measured (WCAG AA): ink 15.6:1, slate 6.0:1,
  muted `#5E6E84` 5.2:1, blue 5.3:1, amber text `#97590A` 5.6:1, green text `#147A47` 5.4:1.
  Teal, amber and rose are only used for chart marks (≥ 3:1), never for body text.
- Chart series order is fixed and validated with the dataviz palette checker (all checks pass):
  blue, teal, amber, violet, rose; slate for de-emphasis/comparison.
- `.tmv-panel` (quiet data panel, 14px radius, layered shadow) and `.tmv-gloss` (top-edge highlight,
  faint diagonal tint, thin translucent border; decorative layers behind content). Gloss is used on
  the four KPI cards and the Needs-attention panel only. Reduced-motion is honoured.

**Navigation labels**: Overview · Jobs · Drivers · Live fleet · Vehicles · Liability & checks ·
Alerts & messages · Settings. Routes and deep links are unchanged. The finder stays "Search jobs or
jump to page" because it does run a real server-side job search (`GET /api/admin/jobs?q=`).

**Shared components** (`components/ds/Charts.tsx`): `KpiCard`, `Sparkline`, `ChartPanel` (question,
basis, coverage, legend, loading skeleton, panel error + retry, empty state, "Show data table"),
`ChartLegend`, `ChartTooltipBox`, `CHART` colour tokens.

**Operations overview** (`pages/OverviewPage.tsx`), in this order:
1. Heading, period description, last-updated time, Refresh, one primary action (View jobs, which
   opens Jobs on the same period).
2. One shared date range: Today · Yesterday · Last 7 days · Last 30 days · Custom range (London days).
   Stored in the URL; every KPI and chart uses it.
3. Four KPI cards: Total jobs, Final charges, Recorded receipts, Late arrivals (see `docs/OVERVIEW_AUDIT.md`).
4. Job activity (wide) + Needs attention.
5. Final charges trend + Driver performance.
6. Tabs: Payment methods · Timing · Today's jobs.

**Driver report**: Summary shows four metrics, a coverage line, a Completed-jobs trend and a
Working-time trend, then the review list. Other tabs keep their content with the new visual language.

## Data definitions — one dataset for the whole overview

All overview KPIs and charts read **every job whose scheduled start is in the selected range**
(`GET /api/admin/jobs?from&to&page&pageSize=100`, all pages; `hooks/useRangeJobs.ts`). If the server
reports more jobs than could be loaded (cap 30 pages) the page shows "Partial data". Definitions live
in `utils/overviewData.ts`.

| Metric / chart | Question | API fields | Rules |
|---|---|---|---|
| Total jobs | How much work is scheduled? | count of jobs in range | Previous-period comparison only when both periods loaded completely |
| Recorded receipts | What was received? | `paymentBreakdown` receipts (not invoices) on completed jobs | "None recorded" when no completed job has a payment; comparison only when both periods have receipts |
| Late arrivals | How many arrived late? | Verified arrivals only (`timingSummary`) | More = worse (red). Unverified arrivals are not scored |
| Final charges | What was charged? | `amountCharged` (pence) on completed jobs | Includes invoices; not money received. Missing values make it "Final charges (known)" with a count, and the comparison is withheld |
| Job activity | How is workload changing? | `bookedStart`, `status` | Each job on its scheduled day with its **current** status (not a historical snapshot) |
| Final charges trend | How are charges changing? | `amountCharged`, `bookedStart` | Linear (no smoothing). A day with no completed jobs is £0; a day whose charges are all missing is a gap. Dashed slate line = same measure for the previous equal-length period |
| Driver performance | Who did the most completed work? | `driverInitials`, `driverName`, `status`, `amountCharged`, `actualMinutes` | Metric: completed jobs (default), final charges, working time. No composite score. Click opens the driver report with the same range |
| Payment methods | How were receipts received? | `paymentBreakdown[].method/amount` on completed jobs | Cash, Card, Bank transfer, Payment link. Invoices (billed, not received), unclassified methods and jobs with no payment are shown separately |
| Timing | Where are delays/overtime? | `delayMinutes`, `arrivalDelaySource`, `overtimeMinutes`, `status` | Only verified arrivals are scored; unverified is its own series. Total lateness and average lateness (late jobs only) are separate |
| Needs attention | What needs action now? | today's jobs, live fleet, delivery log, fleet events, vehicle compliance | Today/live, not the selected range. One row per issue type; overlapping counts are never summed |

Road-charge analysis stays in the driver report (Road charges tab).

## Verification (2026-10-14)

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run`: 73 files, 403 tests passing. New tests: `utils/overviewData.test.ts`
  (definitions, missing ≠ zero, paging, comparison periods), `components/ds/Charts.test.tsx`,
  `pages/OverviewPage.test.tsx`.
- `npx vite build`: succeeds; mock fixtures are not in the bundle (checked by string search).
- No lint script exists.
- Browser review on the local dev server with the mock API, at 1440, 1280, 768 and 390 px: no page-wide
  horizontal overflow; KPI cards 4 → 2 → 1 columns; charts single-column on mobile. Screenshots are
  in the session scratchpad `screenshots-redesign/` (fictional data).
- Not verified: a screen-reader pass, and Windows high-contrast/forced-colours mode.

## Remaining backend requirements

1. **Historical status**: Job activity can only show each job's current status. A per-day
   status history (or status-change log) is needed for a true "status on that day" chart.
2. **Server-side aggregates**: the overview loads every job in range (up to 3,000 jobs at
   100/page). A range-aggregate endpoint (counts by day/status, sums with missing counts) would
   remove the page cap and the extra requests.
3. **Revenue definition**: `GET /api/admin/summary` `revenuePounds` and the driver-summary
   `revenuePounds` are not documented (billed vs received). The overview therefore uses
   `amountCharged` ("Final charges") whose meaning is confirmed in the frontend.
4. **Missing driver submissions** are not exposed on the jobs list, so they can't be counted on the
   overview; they are reported per driver (driver report).
5. **Invoice payment tracking**: there is no record of when an invoice is paid.
6. Vehicle attention counts the first page of `GET /api/admin/van/drivers`; the panel says so when
   there are more pages.

---

# TMV Aurora pass (2026-10-14)

Second redesign pass on the same branch: a colourful, glass-layered identity with two themes,
a new shell and radial analytics. Functional behaviour, routes, data definitions and
financial rules are unchanged. Screenshots (fictional mock data): `docs/aurora-screenshots/`.

## Themes
- `dashboard/adminTheme.css` now defines **Aurora Light** (default) and **Midnight Aurora**
  (`html.tmv-admin[data-admin-theme="dark"]`). Each has its own surfaces, borders, shadows,
  glass values, chart hues and ambient glow (`.tmv-ambient`), not an inversion.
- `hooks/useAdminTheme.ts`: preference `light | dark | system`, persisted under
  `tmv:admin-theme`; with nothing stored it follows the OS. Switch lives in the header.
- **Root-cause fix**: `App.tsx` wrapped the admin in `data-theme="light"`, which re-declared every
  token on that subtree and silently masked `html.tmv-admin`. The wrapper no longer sets a theme;
  `AdminApp` pins `<html data-theme="light">` while mounted (and restores it).
- Legacy `bg-white` / `bg-slate-*` utilities are mapped onto the surface tokens in dark, so every
  page (Jobs, Drivers, Live fleet, Vehicles, Liability, Alerts, Settings) follows the theme.
- Status colours: completed turquoise, in progress blue, scheduled violet, cancelled slate;
  amber/coral are reserved for warnings and alerts. Every status keeps a text label.

## Shell
- Midnight gradient sidebar with groups (Operations · Fleet management · Communication · System),
  icon tiles, gradient active pill, collapsed mode with tooltips (aria-label kept), narrow-tablet
  default collapse. Bookings / Payments / Charges & reconciliation are **not** listed: those screens
  do not exist yet (`NAV_GROUPS` in `navigation.ts` is where they join).
- Frosted command header: search (real job search), London clock, refresh, shortcuts,
  appearance switch, alerts bell, account menu.

## Overview ("Operations command center")
1. Hero: LIVE/Historical badge (live only when the range includes today), period, London time,
   refresh state, View jobs, the unchanged Today / Yesterday / Last 7 / Last 30 / Custom picker.
2. Four distinct KPI cards: Total jobs (status-mix ring), Jobs in progress (share ring + live dot),
   Completed jobs (completion ring), Final charges (gradient sparkline). Comparisons only when both
   periods are fully loaded; Final charges stays "known" when values are missing.
3. **Operations performance**: large status donut + per-status cards (count, share, comparison;
   click opens Jobs on that status; hover links ring and card).
4. **Attention center**: one card per issue type, priority filter (All/High/Medium/Low using the
   existing severities, nothing promoted), high-priority summary, latest time, direct action.
5. **Job activity & trends**: Trends (Day/Week/Month, gradient stacked bars), Distribution
   (weekday donut), Activity heatmap (weekday × scheduled start hour, London). All have data tables.
6. **Fleet intelligence**: tracker connectivity gauge (current ≤ 30 min / stale / unknown, the one
   freshness policy), drivers on jobs, assigned later today, vehicles needing attention, vehicle list.
7. **Live operations**: today's active / upcoming / awaiting assignment / past start time, with a
   refresh timestamp and a "Stale" flag if refreshing stops.
8. Final charges trend, Driver performance, Payment methods · Timing · Today's jobs (unchanged data).

## Design system additions
`ds/Charts.tsx`: `RadialProgress`, `DonutChart`, `SemiGauge`, `Heatmap`, restyled `KpiCard`
(`accent`, `visual`, `live`), `ChartPanel` (`icon`), chart colours as CSS variables (`CHART.*`).
`components/overview/*`: `OperationsPerformance`, `ActivityPanel`, `AttentionCenter`,
`FleetIntelligence`, `LiveOperations`, `helpers`. Primary buttons use `.tmv-btn-primary`;
cards use `.tmv-panel` / `.tmv-gloss` + `.tmv-accent-*`; motion respects reduced-motion.

## Verification
- `npx tsc --noEmit`: 0 errors. `npx vitest run`: 74 files, 417 tests passing (new: workloadGrid,
  DonutChart/RadialProgress/SemiGauge/Heatmap, theme resolution, attention filter, status
  breakdown, activity views). `npx vite build`: succeeds.
- Browser review on the mock API at 1920, 1440, 1024, 768 and 390 px, light and midnight: no
  page-wide horizontal overflow, no console errors. Jobs, Drivers, Live fleet, Vehicles, Alerts and
  Settings checked in midnight.
- Not verified: screen-reader pass, forced-colours mode, real-backend data, driver-report and
  liability sub-pages in midnight (they inherit the tokens but were not individually reviewed).

## Not built (no real data or screen yet)
- Bookings, Payments, Charges & reconciliation nav items and screens; collection-progress rings
  and payment-status visuals need a payment ledger (see backend requirement 5 above).
- Driver "available" status: no availability rule exists; Fleet intelligence shows drivers on
  jobs / assigned later instead. On-time %, submission compliance and validated performance scores
  need the per-driver submission data listed in requirement 4.
- Critical severity: the existing model has High/Medium/Low only, so that is what is shown.
- Native booking components (multi-step form etc.) are not part of this pass.
