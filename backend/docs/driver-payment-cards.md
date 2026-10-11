# Driver Breakdown Payment Cards

Client-directed change, 2026-10-10. Applies to the Payments tab of each driver report. Total Charges and Driver Collected are also shared with Performance.

All four totals are computed server-side from every completed job in the selected driver/date range, before pagination. Incomplete/cancelled jobs are excluded. Money uses safe integer pence. No job/manual/payment record is changed or repriced.

| Card | Source |
| --- | --- |
| Total Charges | Saved original system calculation, matching the calculated Total Charges in the driver summary/job breakdown. |
| Driver Collected | Final recorded driver-charged amount, formerly Driver Charged. This is a label-only rename, not a change to calculation or proof-of-receipt requirements. Adjustment reasons, job links and original/final amounts are available in its expandable reason list. |
| Manual Entries | Available valid collections entered in locked Manual details forms. Show their filtered full-range subtotal even when other submissions are missing; amount and missing/invalid counts are red when incomplete. No available valid entries gives a zero subtotal with the missing count, not a claim that every job collected zero. Unpaid invoice declarations and separately confirmed prepayments are not added. |
| Outstanding | Driver Collected - Manual Entries. Signed full-range difference, not clamped; a negative result is an over-collection difference. The complete balance remains Unknown while required entries are missing/invalid, even though Manual Entries shows its available subtotal. |

This card-level entry balance is distinct from the existing verified debt/prepayment reconciliation fields used in evidence/comparison/export details. Those verified fields are preserved, not silently changed to claim that customer debt is established by manual entries alone.

The financial breakdown remains sourced from job-workflow payment records, never the completion Manual details form. Its final Total sums payment-method amounts including invoice amounts, which remain labelled uncollected. Invalid/missing job-flow evidence makes the complete Total unknown. The receipt chart excludes invoices and unknown methods. Prices, receipt totals and manual totals must not be added together as separate payments.

The Payments tab's Job collection reconciliation section is removed. System/Manual comparison and job history remain available in their own tabs.

Comparison follow-up: System totals display Total Charges, Driver Collected and Working Time. Manual totals display Total Amount (available manual subtotal), Reported Time and Helper Hours. Job rows compare the final driver-charged amount directly to manual-form collections without adding prepayments; congestion/tunnel fees are included on both aligned sides, with multiple reported tunnel fees summed safely and unknown amounts preserved. The lower signed-difference/outstanding/excess summary strips and separate GPS-observed fee blocks are removed. The specific prepayment-provenance/overlap warning and redundant missing-manual/balance line are hidden in this renderer; backend audit fields and other validation warnings are retained.

Completed-job buttons navigate to `section=finished&job=<jobId>`, whose existing Finished Jobs route opens the requested detail drawer. Known unfinished jobs still use the regular jobs route. Report date filters are retained during navigation. These display/navigation changes passed 17 focused UI tests and the frontend typecheck; no database mutation or deployment occurred.

Report pages include a driver dropdown in the header actions immediately to the left of PDF, backed by the existing authenticated driver roster hook. Selecting another driver retains dates, tab and chart grouping, clears the old job reference, resets all detail pages and loads the newly selected driver's report. Existing export cancellation on driver changes is retained. The selector remains available during report loading/failure; roster failures offer retry without hiding a successfully loaded report. Inactive accounts are selectable, and an already-open historical identity missing from the roster is preserved as a fallback option. Placement/switching verified with 22 focused tests, frontend typecheck and synthetic mobile layout: selector and PDF remain on the same row without page overflow. No production record changes.

Client follow-up removed the Penalties & Liabilities tab and its dedicated report content. The report now has six tabs, ending with Congestion Charges; old `reportTab=liabilities` links fall back to Performance. Hidden liability pagination is no longer requested; old pagination parameters are still cleared on filter/driver changes. Stored evidence, backend APIs, existing per-job evidence and export data are unchanged. Verified with 21 focused UI tests and frontend typecheck; no database changes or deployment.

Client follow-up removed This Month, Last Month and This Week from the shared dashboard date preset buttons. Today, Yesterday, Tomorrow, 7 Days and custom date inputs remain. Weekly/monthly chart grouping is not a date-filter preset and is unchanged.

Verification: complete backend suite 496 tests/51 files; frontend suite 206 tests/47 files. Backend/frontend typechecks and both builds passed; the existing frontend bundle-size warning remains. Synthetic 0/3/105-job PDF/XLSX files were regenerated and independently reopened; all eight sheets, monetary types/totals, job/source references, long descriptions and PDF footer checks passed. Browser verified four cards, formula, job-flow total and no reconciliation section at desktop and 390px mobile widths without page overflow. No production mutation, push or deployment.
