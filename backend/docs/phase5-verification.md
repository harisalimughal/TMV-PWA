# Phase 5: Liabilities and Evidence Reporting

Date: 2026-10-09. Status: implemented and verified locally within D07. No release or production import occurred.

## Scope

The user excluded new driver-entered liability/parking amounts. Phase 5 therefore links and reports existing evidence without adding a monetary collection workflow. No driver form fields, admin financial/status editing endpoints, or updates to locked Manual details were added. Existing legal notices/signature text were not changed.

Parking forms currently capture a client name, restriction photos and a signature. Liability forms capture risk categories, photos, signatures and checkpoint text. Neither proves an actual fine/damage charge or captures its amount. A signed notice or category such as Van Overloaded is not automatically converted into a penalty. Each existing submission is one linked evidence record, not one charge per risk category.

## Delivered Records

- Structured parking/liability records with stable scenario Mongo source IDs, source fingerprints, job IDs, actual admin job deep links, reporting/date provenance, description, checkpoint and original submitter.
- Photos/signatures retain their URLs and capture/location metadata. They are linked, not duplicated/reuploaded.
- New job-scoped scenario submissions snapshot authenticated driver initials/name/email and the assigned tracker identity. Driver-provided fields cannot override that snapshot or supply trusted approval/financial metadata.
- Legacy records preserve the original submitter, with historical initials/name/vehicle explicitly unknown rather than inferred from the job's current driver or current roster.
- Unknown amount and responsible party stay null/unknown. Open on a notice means awaiting review, not proof of money owed. Explicit zero is supported only from a valid approved structured monetary source.
- Reporting date uses a valid approved incident timestamp when available; otherwise it uses submission time with that fallback labelled. Invalid or timezone-less dates remain unknown; the current clock is never substituted. Checkpoint text is not parsed as an incident time.

Only parking/liability submissions linked to a real job are included. Standalone storage check-in/out submissions and operational Calendar exceptions are not treated as monetary liabilities. No existing approved monetary-source integration was found or activated in this phase.

## Approved-Source Contract and Audit

An optional typed `liabilityFinancial` source contract supports a future/already approved structured import: approval reference, actor/time, integer-pence amount, type, responsibility and optional incident/status history. It is not populated from arbitrary scenario form fields, free text, a Calendar price or legal-notice examples. There is no intake endpoint for it.

Recognized types are parking, damage, penalty, fine and other. Statuses are open, disputed, paid, waived and resolved. Imported transitions require unique event IDs, ordered explicit-offset timestamps, a matching prior state and an audit actor/note. Moving out of a terminal state requires an explicit audited reopening to open.

`job_liabilities` stores separate audit snapshots with unique source references and a partial unique approved financial-reference index. Identical imports/retries do not add another record or amount. Source changes never silently overwrite amount, responsibility, driver/job identity or evidence. Valid approved append-only status-history extensions can reconcile through a source-hash compare-and-swap while preserving the original monetary/evidence fields and complete audit history. Concurrent unresolved updates fail safely for retry.

If source data changes, the read report preserves the saved audit snapshot and flags the conflict. Missing source references are surfaced rather than turned into current charges. Legacy fingerprint identity can correlate identical payloads, but cannot prove that a changed payload without a stable source ID is the same original incident; this limitation remains explicit.

## Totals and APIs

Liability amounts remain completely separate from customer collections, GPS road fees, overtime, job prices and driver Manual details.

Reports expose known monetary subtotals, unknown amount count, unverified evidence count, unresolved known amount, status groups and a nullable complete total. Repeated financial approval references are counted only once; conflicting amount/status/responsibility references are excluded from known monetary subtotals and flagged via counts. Unknown or conflicted/truncated data never claims a complete monetary total.

Authenticated admin routes under `/api/admin/liabilities`:

- `GET /jobs/:jobId`: read-only projection of linked source evidence, saved audit/conflict information and isolated totals. Does not import, edit sources, upload evidence or change money.
- `POST /jobs/:jobId/reconcile`: explicitly persist/reconcile existing source snapshots. Accepts no body fields for editing amounts, responsibility or status; nonempty bodies are rejected. This imports existing source data only, not a new financial intake action.

Per-job source/audit reads are bounded at 2,000 records each. Truncation returns Partial coverage and an incomplete/null full total. Phase 6 owns complete filtered driver aggregation; Phase 7 owns dashboard sections and interaction. This phase does not claim a new liability dashboard screen.

## Verification

- Final full backend regression: 411 tests passed across 39 files.
- New Phase 5 coverage: 20 model tests, 7 report-service tests, 4 persistence tests and 2 scenario-submission boundary tests.
- Backend typecheck and TypeScript build passed; web typecheck passed.
- `git diff --check` passed with Windows line-ending warnings only.
- Checks include unknown/zero/invalid amounts, multiple and repeated sources, deterministic identity, reassignment safety, evidence links, risk-category handling, invalid dates, approved status validation/extensions, immutable financial fields, concurrent/idempotent imports, storage failure, duplicate/conflicting approvals, source changes/removal, truncated reads, read-only reporting and tampered driver metadata.

Tests use synthetic source data and mocked database/provider/storage boundaries. Real Mongo indexes/concurrency and a deployed full workflow were not tested. No backend server was started, live import/provider write occurred, or environment file changed. Nothing was pushed, committed or deployed.

## Review Before Phase 6

1. A parking notice or liability risk form with no captured amount must show Unknown, not GBP 0 or a guessed statutory fine. A signed notice does not assign legal responsibility automatically.
2. Original submitter and new submission identity snapshots must stay historical even if the driver/job is later reassigned. Legacy missing initials remain unknown.
3. Photos, signature, checkpoint, date provenance and job link must remain associated with the source submission. No liability is inferred from a standalone storage form or a missing Calendar booking exception.
4. Imported known amounts must remain outside customer payment and GPS totals. Approved duplicate references must not inflate totals; changes require review, not silent repricing.
5. Intake/editing stays disabled in the next phases. Complete report filtering, responsive presentation and exports are still later work.

Before release, validate admin authentication, index creation, idempotent imports and approved-source status reconciliation in an isolated test database. Phase 9 must also complete job-deletion/factory-reset/orphan handling for the new audit collection; these existing maintenance actions were not run or expanded here. No production backfill or monetary-source integration is implicitly authorized.
