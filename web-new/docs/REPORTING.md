# Reports and printable documents

What the dashboard can produce, where each one's data and wording come from, and what
is not possible yet. Written October 2026 alongside the Generate Report feature.

## Report types

| Report | Where | Source | Formats |
| --- | --- | --- | --- |
| Driver job report (weekly or any period, up to 93 days) | Overview and driver profile, Generate Report | Backend driver report (`/api/admin/driver-reports/:code`), all job pages | PDF (browser print), Excel, CSV, Word |
| Driver breakdown | Generate Report; Driver report page download | Backend export (`/export.pdf`, `/export.xlsx`), the file the old dashboard's PDF button gave | PDF, Excel |
| Jobs list | Generate Report; Jobs page Export | Backend `/api/admin/jobs/export.csv` | CSV |
| Job Completed dossier | Job drawer, Download PDF | Job record | PDF (browser print) |
| Check In, Check Out, Parking Liability, Liability Report | Liability record preview, Docs menu | Scenario record | PDF (browser print) |
| Scenario lists, van records | Liability and Van pages, Export | Backend CSV exports | CSV |

Every report the old deployed dashboard offered is still available. The driver job
report is new.

## Driver job report

- One data model (`src/screens/admin/dashboard/reports/driverJobReport.ts`) feeds all
  four formats, so they list the same jobs and the same totals. Tests check this.
- Every total is the backend's own summary value; nothing is recalculated in the browser.
  The measures stay separate: final charges (billed, invoices included), recorded
  receipts, unpaid invoices, manual entries (what the driver reported collecting),
  outstanding, working time, driver-reported time and scheduled hours.
- "All drivers" means every driver in the roster; drivers with no jobs in the period
  are left out and named in a note. Combined totals add the driver sections. Each job
  carries one driver code, so no job is counted twice.
- Periods are London calendar days (Monday to Sunday weeks). "Last 7 days" is the same
  range as the dashboard's existing 7 days filter.
- XLSX and DOCX are real Office files (checked with openpyxl, python-docx and
  LibreOffice). CSV cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so
  spreadsheets do not run them as formulas.

## Missing, known-only and complete figures

Every summary line carries a coverage: `complete` (every job contributed, a real zero included),
`known-only` (some jobs had no value, so it is the sum of the known ones, with the note saying how many) or
`unavailable` (the source did not provide it; shown as "Not available", never as 0 or £0.00). Money stays in
integer pence until it is formatted.

- Unpaid invoices: an explicit `Invoice` amount (including 0) is used as sent. If the server leaves the method out,
  it is zero only when `financialBreakdown.invoiceJobs` is explicitly 0; otherwise it is "Not available". If the
  backend omits zero-balance methods, this will show "Not available" for drivers with no invoices until the server
  sends `invoiceJobs` or an explicit 0 (open backend question).
- Combined totals: if any driver's value is unavailable (or a driver failed to load) the combined total is
  "Not available", and the sum of the drivers that have a value is shown separately as a known subtotal.
- A failed driver does not discard the others: the report is "partial", names the drivers left out, and has no
  combined totals.

## The Generate Report dialog

Each run uses a frozen request (type, drivers, range). Controls are locked while it loads; Cancel generation,
Reset, closing the dialog or starting a new run invalidates it, so a late response is never shown. Editing any
option after a result discards that result. Each report type keeps its own driver choice. The driver list has four
states (loading, failed with Retry, empty, available); All drivers needs it, a driver chosen up front does not.
The Overview range is used as given; a missing boundary is left for the user to fill; over 93 days the dates are
kept with an explicit "use the last 93 days" button.

## The workspace (dialog)

One wide dialog (`size="3xl"`): numbered options on the left (report type cards, drivers, period chips, file format
tiles) and the report preview on the right, stacked on a phone with the main action first in the footer. Parts are in
`reports/reportWorkspaceParts.tsx`; the logic stays in `GenerateReportModal.tsx`.

- Preview states: not generated (with the reason when options changed or a run was cancelled), loading (real progress
  bar and a per-driver list), complete, complete with no jobs, partial (counts, Retry failed drivers, Discard partial
  report), error (Try again) and downloaded. Each has a text label and badge; colour is never the only signal.
- When a run ends, focus moves to the preview heading (unless the user moved on), it is scrolled into view, and "Report
  ready" is announced politely. Reduced motion is respected (`motion-safe`, `motion-reduce`).
- Actions: Reset, Cancel, Generate Preview, then a specific Download (PDF, Excel, Word or CSV) and Print report.
  Editing any option clears the preview and says so, so a stale file cannot be downloaded.
- Checked with axe-core on the dialog in light and dark at 1440 and 390 px (idle, choose drivers, ready, partial: no
  violations), keyboard tab trapping, arrow keys on option groups, and Escape returning focus to the opener.
  Screenshots: `docs/generate-report-screenshots/`.

## Loading and completeness (driver job report)

```
selection -> validation -> frozen request -> per-driver loading (3 at a time, pages in order)
          -> usable-record check -> de-duplication -> sort -> assemble -> status -> preview -> export
```

- Each driver has its own result: pending, loading, success, empty (a valid result with no jobs), failed or
  cancelled. A failed driver never discards the others; the report is PARTIAL, names the failed drivers, and has no
  combined total. Only when every driver fails does the load fail. No automatic retries; **Retry failed drivers**
  loads only the failed ones and merges them (loaded sections are reused as they are, attempts are counted, no job is
  added twice). **Discard partial report** drops it; Cancel during a retry returns to the partial report.
- Concurrency is 3 drivers at a time (`DRIVER_CONCURRENCY`); a driver's own pages are fetched one after another using
  the page size the server returned, so nothing is requested twice. A driver is capped at 1000 jobs and says so.
- A job is identified by its job id inside one driver's report. Repeats from overlapping pages are dropped (first
  kept) and the list is flagged as possibly incomplete, because client side de-duplication cannot recover a job the
  server's paging skipped. The same job under two drivers is two assignments and is kept. Records with no job id,
  status, finance or duration block are left out, counted, and make the report PARTIAL; non-numeric money or time
  fields become "not available", never 0.
- Order: dated jobs oldest first by London date and time, undated jobs last, ties by job id. Preview and every file
  use the same order.
- Status: COMPLETE, COMPLETE with no jobs (EMPTY), or PARTIAL (failed drivers, shortened list, unreadable records).
  A load that fails outright shows an error, never a report.
- "All drivers" includes inactive drivers by default (they can have historical jobs). A checkbox turns them off, and
  the report then names them as left out by choice.
- Progress shows real counts ("Loading driver reports - 7 of 12 completed, 1 failed"); there are no fake stages.

### Date ranges by endpoint

Driver reports take an exclusive end (the next London midnight); the jobs list takes an inclusive end (the last
millisecond of the last London day). `reportApiRange` and `jobsListRange` in `utils/reportNavigation.ts` are the only
two conversions and every report entry point uses one of them. This is inferred from the call sites and the mock API,
which models the backend; **it has not been checked against the real backend** (not in this repository). Contract
tests cover clock changes and month ends.

## Files and printing

- **Download PDF** writes a real PDF (A4 landscape) from the same report model, with no PDF library:
  `reports/pdfWriter.ts` (standard Helvetica, WinAnsi text, other characters become `?`) and `reports/driverJobPdf.ts`
  (layout). Same input gives the same bytes. File name: `tmv-driver-jobs-KA-2026-10-05-to-2026-10-11.pdf`
  (`drivers` for several), from the report's own range, never from the tab title. Job table columns use their own
  shares (`PDF_SHARE`, exactly 100%), the header repeats on every page, rows are not split, long ids are broken
  rather than clipped, and every page says "Page n of m" and the report status.
- **Print report** is a separate action that prints the on-page copy through the browser (`utils/printSession.ts`).
  The document stays until `afterprint`, the print media query turning off, or a 2 minute safety timeout; returning
  from `print()` is never taken as finished. Cleanup (body class, tab title) always runs, including on errors, and a
  second request while one is active joins it. The tab title is set while printing as a file name hint, but the
  browser controls that save dialog, so only Download PDF has a guaranteed name.
- **CSV** has four labelled sections, each a normal table: `REPORT` (status, period, drivers, generated, source),
  `DRIVER SUMMARY`, `OVERALL SUMMARY` (several drivers) and `JOB RECORDS`. Money in pounds, minutes as whole numbers;
  an unavailable figure is an empty cell with Coverage `unavailable`. Nothing in this repository reads the file back.
  The Jobs list option is the server's own export and has no totals.
- **Excel**: `Summary` (status, coverage, known subtotal, notes) and `Jobs` (frozen header, filter, real dates, £ and
  `[h]:mm` numbers, "Not available" as text). **Word**: heading styles, schema-ordered paragraph properties, a page
  per driver, repeating table headers, page numbers.
- Every format states the report status (COMPLETE, COMPLETE with no jobs, or PARTIAL with the reasons).

### Final charge, per job and in total

`finance.acceptedPence` (per job) is the amount the driver entered at completion; `paymentCards.driverCollectionPence`
is defined in `docs/audit-implementation.md` as the sum of `acceptedPence`. They are the same measure, so with every
job listed the column adds up to the total (tested). The label "Driver collected" was retired because it is a billed
amount, not money received. If the job list is shortened the report says so and the total still covers every job.

### Verification status

Opened and read back with openpyxl, python-docx, pypdf, pdftotext, and converted by LibreOffice 7+ (Excel and Word
files to PDF). That is not Microsoft Excel or Word: opening the files there is still to be done by a person.

## Google Sheets and Docs

The dashboard has no Google sign-in, so it cannot create a file in someone's Google
account. The Excel and Word files import into Google Sheets and Docs with File > Import.
Direct creation would need a backend OAuth flow (Drive scope `drive.file`) with tokens
held on the server, not in the browser.

## Legal wording

- The four Liability documents print the wording from `src/scenarioSpec.ts`, which
  mirrors the backend's `workflow/scenario.spec.ts`: the exact text the driver app shows
  the customer before they sign. `reports/documentTemplates.ts` gives each scenario a
  template id (`liability_check_in`, `liability_check_out`, `parking_liability`,
  `liability_report`) and a version. `documentTemplates.test.ts` holds the approved text
  word for word, so any change fails the build until the test is updated on purpose.
- Before this change the PDFs paraphrased the parking notice and printed no declaration
  for the other three scenarios.
- Scenario records do not store which wording version was shown at signing. A PDF
  printed today shows the current wording and says when it was printed and which
  template version it used. Storing the version with each submission is a backend change.
- The Job Completed dossier prints no customer declaration. The completion text is an
  editable Settings value and the job record does not store the text the customer saw,
  so printing today's setting could show words they never signed. Storing the signed
  text with the job is a backend change.

## Not done

- Generating user is not recorded in the files: the admin session does not expose the
  signed-in user's name to the frontend.
- No server-side audit log of generated reports; that belongs in the backend.
- Payment and Liability report types in Generate Report: the backend has no aggregate
  endpoint for them yet (see "Not built" in CLAUDE.md).
