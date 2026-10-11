# Phase 8 - Complete Driver Report Exports

Date: 2026-10-10. Status: implemented and verified locally; not deployed.

Phase 9 follow-up supersedes the initial capacity/audit details below: PDF pages are now streamed with `Page N` footers, exports default to one process-local slot (bounded override to two), and workbooks have a million-cell guard. Backend dependency audit is now clean; remaining frontend build-tool findings and live/device checks are documented in `phase9-verification.md`.

## Delivered

- `GET /api/admin/driver-reports/:initials/export.pdf` and `export.xlsx` use the existing `requireAdminAuth` mount. Parameters are `from`, `to`, and optional `groupBy=day|week|month`. Driver/range/format/grouping are validated before loading private data.
- The endpoint calls the same unpaginated `getDriverReport` service as the dashboard. Screen page size, detail page, active tab and scheme filters do not limit exports. Both formats use one generated report result; neither modifies source records or reconciles charges during download.
- Attachments have correct MIME types, safe dated filenames, private/no-store caching and nosniff. At most two exports are in flight per process; excess requests receive 429 with retry guidance. Existing 366-day/5,000-job/source capacity limits remain explicit failures. PDFs over 3,000 pages are refused without returning a truncated file.
- PDF: TMV headers, repeated record context, page numbers, GBP values, London range, summary, five trend plots with source data, payments, job details, aligned system/manual comparisons, charges/GPS evidence and liability records. Long values split across pages; unknown moving data is not graphed as measured zero. Empty sections are labelled. Detailed audit PDFs can be lengthy because every job is retained.
- Excel: Summary, Performance, Payments, Jobs, Comparison, Tunnels, Congestion and Liabilities. Currency cells contain pounds as numbers with GBP formats; duration units are labelled. Four frozen rows, primary-table filters, wrapped text, sized headers and alternating rows make the workbook readable. Further sub-tables have independent headers; Excel permits one native worksheet filter range, so their records remain available without an additional worksheet-wide filter.
- Exported snapshots include billing blocks/rate/rule, charge/tariff sources, start/finish provenance, historical identity, locked manual details, confirmed prepayment references and verification states. GPS events omit raw provider payloads. Unclassified events appear separately in Summary rather than being misclassified as billable tunnel activity. Outside-cohort evidence jobs keep context links and remain excluded from financial totals.
- Report-page PDF/Excel controls include loading, disabled duplicate submission, abort-on-driver/range-change/unmount and error messages. HTML sign-in responses/JSON errors are not downloaded as report files. Blob URLs are revoked after download.

## Accounting Safeguards

Unknown is not zero. Missing manual submissions do not imply no collection or a proven debt. Invoice/generated links do not establish receipt. Known subtotals retain their unknown counts; outstanding and excess are summed independently per job. Liability amounts are not added to customer collections. GPS customer obligations are evidence/calculation components, not additional collections to sum on top of the saved job total.

Primitive monetary cells are GBP; JSON arrays retain explicitly named `amountPence` values in pence. Source timestamps and companion London display values are both available. Numeric cells are not converted to spreadsheet formulas. Text beginning with whitespace followed by `=`, `+`, `-` or `@` is escaped; long text above the Excel cell limit, non-finite numbers and unsafe monetary precision are refused rather than silently truncated/rounded.

The service remains nontransactional. One file is internally based on one report result, but a subsequent refresh/download can differ if live records change between requests. Exports do not create new monetary liability intake, admin edits or retroactive job repricing.

## Local Verification

- Final full backend regression: 467 tests passed across 47 files. Focused export/route/auth/service tests cover invalid requests, private errors, capacity failure, concurrency slot release, 105-job completeness, signed amounts, formula-like text, source IDs, empty reports and exact shared summary values.
- Full frontend suite: 197 tests passed across 46 files. Both production builds and type checks passed. Existing large frontend chunk warning remains.
- An old work-breakdown test represented a missing price with `0`; its fixture now actually omits the value. An additional regression verifies that a genuine zero remains zero. No runtime billing/helper behavior was changed to satisfy that test.
- Independent `pypdf` and `openpyxl` reads verify 0/3/105-job files, eight sheets, exact row identities/counts, numeric GBP cells, totals matching the JSON snapshot, no formula cells, frozen rows/filters, source IDs and a 3,750-character repeated-evidence description. PDF identifier extraction normalizes built-in-font kerning whitespace around hyphens; stored identifiers are not modified.
- Rendered/inspected PDF summary, comparison and continuation pages and all eight worksheet views. Found and fixed footer-induced extra pages, redundant payment expansion and narrow-sheet header clipping. Checked report controls at 1280x900 and 390x844; mobile actions now sit below the driver identity.
- Browser preview showed 105 completed jobs and GBP 26,775.00, matching the same synthetic export snapshot. PDF/Excel clicks completed without in-app errors. The in-app browser's download-event waiter timed out, so an actual browser-managed save path was not independently observed; Blob/filename handling is unit-tested and the generated files were separately opened/validated.

## Review Locally

Frontend-only isolated preview: `http://127.0.0.1:5180/phase8-check.html`.

This preview uses a fixed synthetic 9 October dataset, not the real database. Use `?count=3` or `?count=0` for smaller/empty examples. Date/grouping controls are production components, but the review fixture intentionally returns its fixed snapshot; live range filtering is tested by the existing report service/range tests and must be exercised end-to-end in Phase 9.

Generated review files are in `outputs/phase8-check/` (gitignored). Open `synthetic-3.pdf` and `synthetic-3.xlsx` for a manageable first review; `synthetic-105.*` proves records beyond page 100 are retained.

From `backend`, regenerate with `npx tsx scripts/phase8-export-check.ts`; independently verify with the bundled Python runtime running `scripts/phase8-verify.py` (requires pypdf/openpyxl). `scripts/phase8-sheet-render.mjs` imports the saved workbook into the bundled artifact renderer for read-only visual inspection. Start the isolated frontend server from `web` with `npx vite --config vite.phase8-check.config.ts`. It has no backend proxy and refuses `/api/` access; synthetic download interception is confined to its test entry point.

Check:

1. Both download buttons, filename/extensions and eight Excel sheets.
2. System/manual comparison separation, GBP 5 shortfall on SAMPLE-002 and unknown balance on missing-manual SAMPLE-003.
3. Shared revenue totals, all 105 job IDs, numeric currency/duration cells and preserved negative signed differences.
4. GPS source references, unknown customer/authority charges and separate unpriced liability evidence.
5. Readable PDF continuation pages/footers and mobile download controls.

## Remaining Release Checks

Phase 9 owns actual authenticated HTTP/session integration, driver denial/expiry/renewal paths, production-like bounded-load/memory testing, concurrent source-change behavior, real GPS/portal/provider coverage, real customer names/non-Latin glyph coverage, native Excel/LibreOffice reopening and physical Android/iOS browser downloads. Default PDF fonts follow the existing Helvetica convention; broader script/font requirements need explicit device/document coverage before release. Evidence images are referenced, not fetched/embedded from external hosts during export.

The dependency audit reported 16 pre-existing backend advisories after a scoped ExcelJS UUID override removed the advisory introduced by ExcelJS's older UUID dependency. Existing advisories include critical findings; release readiness must review/remediate them rather than treating passed feature tests as a clean security audit. No unrelated major dependency upgrades were performed.

No backend server was started, no live database/provider writes or imports were performed, and nothing was committed, pushed or deployed. Await the client review before Phase 9.
