# Phase 9 - Integration and Local Release Readiness

Date: 2026-10-10. Local work verified; external release checks remain pending. This is not a claim that Phase 9's live backfill/device requirements are finished. The initial checks below used synthetic data. The user subsequently approved the staging URI and read-only GPS access; partial real-data results and exact remaining boundaries are recorded in `phase9-staging-verification.md`. GPS imports, production database access, push and deployment remain unapproved.

## Local Implementation

- Added safe report/export/history pause switches and a default single export slot per process. Manual submission gates, immutable records and prices are not bypassed by these controls.
- Added a pure, bounded, reviewable GPS backfill proposal CLI with stable IDs and no import/apply capability.
- Fixed GPS history coverage: invalid/future alerts, trip events/drives, malformed event arrays and saturated event/drive responses cannot be labelled complete usable history. Checkpoint resume/idempotence remains intact.
- Added incomplete first-entry hint provenance to reports/exports and a visible comparison note. No legacy crossings, tariffs or wages are invented.
- Fixed session validation for JSON-shaped/non-string cookies and exact expiry. Driver account-read failures now return a private 503 rather than an unhandled Express 4 async rejection.
- Added a million-cell workbook guard and periodic event-loop yields. Streamed PDF pages remove the all-pages buffer; numbered footers now say `Page N`, while the viewer retains the document's intrinsic total count. The 3,000-page limit fails without a partial download.
- Collapsed long liability descriptions to a two-line preview, preserved their complete expanded text, and made missing legacy photo/verification arrays render safely. Corrected the synthetic export fixture to use the real liability projection/summary and valid GPS fields; preview scheme filtering now occurs before pagination.
- Patched compatible backend dependencies, scoped older UUID consumers to the compatible v4 API, aligned backend Vitest to 4.1.11, and applied compatible frontend dependency patches. Node minimum is now accurately declared as 20.19; existing Docker build/runtime majors were not changed.
- Backend tests use worker-local synthetic configuration, do not load the developer's live `.env`, and block external HTTP while allowing loopback tests. The old VAPID tests now use an in-memory settings repository instead of ambient/live keys. Test configuration uses `.mts` and bounded workers.

## Real HTTP Scenario, Synthetic Persistence

`test/phase9-http-integration.test.ts` mounts the production jobs/report/export routers, actual cookie parser, session signing/verification, driver account gate and admin gate on an ephemeral loopback listener. Database, Calendar, storage, notifications and GPS adapters are synthetic/mocked; importing the configured server/bootstrap is deliberately avoided.

Verified:

1. Calendar 90 minutes, internal allocation 120, actual 150, full extra block GBP 55; captured customer congestion component GBP 18 plus base GBP 200 gives expected GBP 273.
2. Production review-completion action persists Completed, immutable identity and the manual-required marker. Starting the next job returns 409 until the manual entry exists.
3. Concurrent identical submissions insert once. Cash GBP 100 + Card GBP 150 is GBP 250 collected; Invoice GBP 23 is not a receipt. Helper is optional and blank. Changing a locked retry returns 409.
4. Listener/module restart with the retained synthetic repository keeps the record, clears transient module caches/locks and permits an identical retry without a second insertion. This is not a real Mongo/process/crash durability test.
5. Full-range report totals reconcile to actual HTTP XLSX contents and PDF bytes. Remaining GBP 23 is reported without adding the congestion component twice. Screen page size does not truncate downloads.
6. Missing, forged, expired-at-deadline, driver and JSON-object cookies cannot access admin downloads. Near-expiry admin and driver cookies renew; deactivated/revoked drivers are denied. Account-read outage returns 503 with no private error text.
7. Cross-driver submission is denied, operational pauses return 503, and a legacy completed zero-price job is not repriced or backfilled with a manual gate.

## Regression and File Checks

- Backend full suite: 485 tests across 50 files passed with synthetic configuration/external HTTP blocked.
- Frontend full suite: 199 tests across 46 files passed, including legacy hints, read-only comparisons, long description preservation and missing evidence arrays.
- Backend/web production builds passed; type checks are included. Existing frontend chunk-size warning remains.
- Independent pypdf/openpyxl reads of empty, 3-job and 105-job exports pass: all rows/source references, shared monetary sums, numeric cells, no formula injection, eight sheets, frozen/filter headers, complete long text, no footer-only pages and correctly numbered streamed pages.
- Inspected rendered summary/continuation PDF pages. Browser checked 1440x1000, 768x1000 and 390x844: separated/stacked comparisons, export controls, charts/unknown states and long liability text. Document widths stayed within viewports (1425/753/375 respectively, including scrollbar space); tablet had two comparison columns and mobile one.
- Synthetic preview and stress outputs are local/gitignored. No live data, provider writes, configured backend startup, push, commit or deployment occurred.

## Bounded Export Capacity

`scripts/phase9-export-stress.ts 500` generated and reopened a 500-job workbook and a complete PDF. The original combined serializer/reopen process peaked at 710,332 KiB RSS (about 694 MiB). Streamed pages reduced the observed peak to 383,688 KiB (about 375 MiB), roughly 46% lower.

The newer run took approximately 5.6 seconds for XLSX and 14.0 seconds for PDF while other checks were running. Files were about 364 KB and 2.97 MB. These are observations on this workstation, not service-level/capacity promises. Process memory includes libraries, synthetic rows and workbook reopening; the real endpoint does not reopen its workbook. Validate actual Mongo/GPS query cost, deployment memory, request timeouts and concurrent traffic in staging. Keep the export default at one slot until then.

## Security Audit

Backend full dependency audit reports zero advisories after compatible patches. Frontend production-only audit also reports zero. The frontend full tree still reports seven build-tool/transitive advisories (five high, two moderate) tied to the Tailwind 3 toolchain; automatic resolution asks for a major Tailwind migration. No force/major styling upgrade was performed. These findings require a deliberate build-tool remediation/review decision before release; trusted-source build inputs are not equivalent to a clean full-tree audit.

Relevant primary advisories reviewed: https://github.com/advisories/GHSA-jqcg-44mw-7w3h , https://github.com/advisories/GHSA-82fw-gwwq-j7x9 , https://github.com/advisories/GHSA-w5hq-g745-h8pq . Audit status is a point-in-time package check, not proof that the whole application has no security vulnerabilities.

## Local Review and Remaining Work

Preview remains `http://127.0.0.1:5180/phase8-check.html`, with `?count=3`/`?count=0` variants. It is an isolated fixed-date synthetic report viewer, not a live database app; scheme pagination works, but date-range/grouping/live job-navigation integration must be checked in the approved staging app. Test it against the files in `outputs/phase8-check/`; stress artifacts/metrics are in `outputs/phase9-check/`.

From `backend`: `npm test`, `npm run build`, `npx tsx scripts/phase8-export-check.ts`, bundled Python `scripts/phase8-verify.py`, and optional bounded `npx tsx scripts/phase9-export-stress.ts 500`. The backfill planner only prints JSON; see `phase9-rollout.md` for its review process and operational controls.

P9.2 actual backfill has not run: GPS reading is approved, but GPS writes/imports are not. Staging report reads/export generation and incomplete-job denial passed against real Mongo; completed-job persistence/index execution, physical portal calibration/history recovery, device/browser-managed downloads, native spreadsheet opening/font coverage, production-like load and client rollout review remain release gates. Existing single-process workflow mutexes must not be represented as multi-instance coordination.

Read `phase9-rollout.md` before any release decision. Keep D07 and immutable manual/billing semantics intact. No release date or push/deploy approval has been inferred.

Subsequent MA-only production read verification after the user completed the job is documented in `phase9-ma-production-verification.md`. Completion, single saved submission, real report comparison and in-memory export generation were verified without writes. Timing/payment source discrepancies and two older active jobs remain for review; live submission mutation tests were not performed.

## Changed Files

- Backend runtime: `src/auth/admin-session.ts`, `session.ts`, `require-driver-auth.ts`; `src/gps/gps.sync.ts`, `gps.sweep.ts`, `gps-backfill-plan.ts`; `src/admin/dashboard/gps.routes.ts`, `driver-reports.routes.ts`; `src/reports/release-controls.ts`, `driver-report.model.ts`, export model/PDF/XLSX generators.
- Backend QA: `vitest.config.mts`, `test/setup.ts`, `phase9-http-integration.test.ts`, `phase9-rollout.test.ts`, GPS sync/push/report scheme tests, corrected export sample fixture; `scripts/phase9-gps-backfill-plan.ts`, `phase9-export-stress.ts`, and streamed-page verification in `phase8-verify.py`.
- Frontend: driver report types/view/styles/tests and the isolated preview's valid scheme pagination. No driver liability/payment-intake redesign was added in this phase.
- Configuration/hand-off: backend package/lockfile and minimum engine, frontend lockfile compatible patches, `.env.example`, `.gitignore`, `plan.md`, and Phase 8/9 verification/rollout docs. Live `.env` and `web/.env.local` were not edited.
