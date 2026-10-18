# Overview audit: duplicate charts removed

Method: the Overview was opened in the browser and every panel was read against its component and
data source (`pages/OverviewPage.tsx`, `components/overview/*`, `utils/overviewData.ts`).

## Matrix (before the change)

| Component | Information | Duplicates | Decision |
| --- | --- | --- | --- |
| KPI "Total jobs", mini donut | Status mix of the period | Operations performance donut | Removed the donut |
| KPI "Total jobs", sparkline | Jobs per day | Job activity & trends | Removed the sparkline |
| KPI "Jobs in progress", progress ring | In-progress count and share | Operations performance "In progress" card, Today's jobs "Active jobs" | Card replaced |
| KPI "Completed jobs", progress ring | Completed count, share, comparison | Operations performance "Completed" card (same count, share and comparison) | Card replaced |
| KPI "Final charges", sparkline | Charges per day | Final charges chart | Removed the sparkline; value and comparison stay |
| Operations performance (donut and four status cards) | The one job-status distribution, with counts, shares and period comparison, each linking to Jobs | n/a | Kept. This is the single status visual |
| Job activity & trends, Trends | Jobs per day, stacked by status (time series) | Legend repeated each status count | Kept; legend now shows colours only |
| Job activity & trends, Distribution | Jobs by weekday | Partly the heatmap rows | Kept (answers "which days carry the work") |
| Job activity & trends, Activity heatmap | Weekday by start hour | n/a | Kept (when is work scheduled) |
| Needs attention | Cross-source issues, today and live | Overlaps Today's jobs "Needs a driver" and Fleet now vehicle count at different grain | Kept (different scope; labelled "Today and live") |
| Fleet now | Tracker freshness, drivers on jobs | n/a | Kept (live) |
| Today's jobs (live panel) | In progress, next pickups, needs a driver, with "All of today's jobs" | n/a | Kept |
| Payments and timing, "Today's jobs" tab | The same day's jobs again as a table | Today's jobs live panel | Removed. "Open in Jobs" remains on the live panel |
| Final charges chart | Charges per day against the previous period | n/a | Kept |
| Driver performance | Completed jobs, charges or working time by driver | n/a | Kept |
| Payment methods | Recorded receipts by method, invoices apart | n/a | Kept |
| Timing | Late arrivals and overtime | n/a | Kept |

## What replaced the duplicates

| New KPI | Question | Source | Rules |
| --- | --- | --- | --- |
| Recorded receipts | What was received? | `paymentMix` receipts on completed jobs | Not invoices. "None recorded" instead of £0.00 when no completed job has a payment. Comparison only when both periods have receipts |
| Late arrivals | How many arrived late? | `timingSummary` verified arrivals | Unverified arrivals are not scored and are counted in the detail. More late is shown as worse |

Both reuse the existing selectors, now computed once on the page and shared with the Payment methods
and Timing panels, so no figure is calculated twice. Calculated, final and received money stay
separate; invoices are never added to receipts.

## Scopes (unchanged)

Selected period: KPIs, Operations performance, Job activity, Final charges, Driver performance,
Payments and timing. Today and live: Needs attention, Fleet now, Today's jobs.

## Not built (no data)

On-time percentage, driver productivity scores, vehicle availability, revenue projections and
other GPS metrics. None exist in the loaded data.
