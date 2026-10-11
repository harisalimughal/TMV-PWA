# Phase 9 - Rollout, Compatibility and Recovery Contract

Status: local implementation/QA only. No release date is approved. No deployment or live backfill has occurred.

## Prospective Activation

The activation instant is the UTC start of an explicitly approved release, recorded in the deployment/change log. Do not invent or backdate that date. Before a release, drain active jobs or approve a documented transition for them, confirm driver PWA updates, and verify that the frontend/backend build identifiers match.

Driver gating is marker-based, not based on a historical booking date: only completed jobs bearing `manualDetailsRequiredAt` require a manual record before a new job starts. Never bulk-add that marker to already completed legacy jobs. Jobs that finish after activation receive the marker atomically with completion, even if an older accepted payment/billing snapshot is retained.

Original Calendar duration/rate and confirmed financial snapshots remain authoritative for their captured versions. Changing current Pricing Settings does not reprice completed jobs. Older jobs already at payment/review remain legacy-priced. Drain/make a policy decision about other active pre-release jobs before enabling new billing; do not silently claim that all old active jobs have been migrated.

## Version and Default Register

| Data | Current Version / Default | Compatibility Rule |
| --- | --- | --- |
| Manual details | `schemaVersion: 2`; absent version is legacy | Preserve old locked records. Do not rewrite ambiguous Invoice/Transfer or missing charge arrays into guessed receipts/charges. Identical normalized v2 retries return the original record. |
| Billing | `calendar-allocation-30min-v1` | Preserve rate, original timestamps, allocation, actual excess and billed blocks. Missing historical snapshots remain legacy/needs verification. |
| Customer road policy | `tmv-customer-road-v1` | Use captured Pricing Settings tariff only when eligible. No historic tariff is inferred from today's rate. Government/authority cost remains separate/unknown. |
| GPS ledger / sync | Stable source IDs; run identity `gps-sync-v1` | Idempotent source insertion, checkpointed retry, no reconstructed crossings from one legacy notification timestamp. Queried means a successful query, not guaranteed provider completeness. |
| Backfill proposal | `gps-backfill-plan-v1` | Dry-run only. No apply/import operation exists in the planning CLI. |
| Liabilities | Evidence record version 1 | Existing notices/risk are not confirmed money/debt. Monetary intake and admin edits remain disabled under D07. |
| Driver report | `driver-report-v1`, additive fields | Unknown is not zero. Cohort is operational start, otherwise booking; end is exclusive, display/rules use London time. Context evidence jobs do not contribute again to financial totals. |

Schema/index additions are additive. Do not delete source collections, drop existing indexes, clear rate snapshots, reset manual locks, or migrate all legacy receipts in place. Any actual migration/backfill needs a backup, reviewed source scope and explicit environment approval. Collection/index execution and legacy data shape still require staging confirmation; tests use synthetic repositories.

`firstEntryHints` exposes old congestion/tunnel notification times as `first-entry-only-incomplete`, with `eligibleForAutomaticCharges: false`. These hints cannot establish the number of crossings or automatically bill a customer. Approach movement remains separate per-job evidence; headline moving totals cover completed on-job activity, not an inferred whole-shift timesheet.

## Operational Pause Controls

Controls default enabled when absent. Use explicit boolean values; invalid values fail closed. Changes are deployment/operator configuration, not an authorization for this task to edit the live environment.

| Environment Variable | Effect |
| --- | --- |
| `TMV_DRIVER_REPORTS_ENABLED=false` | Returns a private 503 for individual reports and their exports before source reads. Does not modify historical data or bypass manual submissions. |
| `TMV_DRIVER_REPORT_EXPORTS_ENABLED=false` | Pauses downloads only; normal report reads remain available. |
| `TMV_GPS_HISTORY_SYNC_ENABLED=false` | Pauses scheduled/manual history imports before provider/checkpoint calls. Does not erase evidence or disable the existing authenticated-token webhook ingestion. |
| `TMV_DRIVER_REPORT_EXPORT_CONCURRENCY=1` | Default one export per process. `2` is permitted only after staging memory/load verification. Other values are rejected. |

These controls deliberately do not disable mandatory manual details or change customer prices. In-flight imports/exports may finish; pausing a switch is not an interrupt or rollback of an already started operation.

If reports are unhealthy, pause exports/reports, keep the current compatible workflow/storage running, inspect the failure and re-enable after verification. If history imports are unhealthy, pause imports, retain failed/partial checkpoints, repair the provider/configuration issue and retry the same approved windows. Never delete checkpoints to hide an incomplete import.

Do not roll back to a build that ignores pending manual markers or rewrites billing snapshots. Keep a compatible patched build and backup; stop new assignments/drain work if a workflow rollback is genuinely necessary. Persisted locked records and completed-job prices must remain unchanged. Existing job/driver mutexes are single-process: keep one backend writer instance unless distributed coordination is separately implemented and tested. An export semaphore is not distributed workflow locking.

## Backfill Review Workflow

1. Obtain explicit approval for an isolated staging database, test tracker(s), available provider history, query quotas and a bounded UTC range. No live history operation is authorized by generating a plan.
2. From `backend`, run `npx tsx scripts/phase9-gps-backfill-plan.ts --from=2026-10-08T00:00:00Z --to=2026-10-09T00:00:00Z --imeis=123` using actual approved test IDs/ranges only when available. The example ID is synthetic. The CLI prints JSON, accepts no `--apply`, and makes no provider/database calls.
3. Review stable run IDs, six-hour windows and min/max fresh history-slice request counts. Counts exclude cached zone/metadata lookups and may be lower on resume; verify the actual provider quota too. Bounds are 1-10 trackers, 31 past-only days, at most 128 windows, and 18 history requests per planned window. Narrow the proposal when it exceeds limits.
4. Only in the approved environment, execute the existing protected `/api/admin/gps/sync` operation for reviewed windows with `requestBudget: 18` from the proposal. This optional field is enforced between 1 and 128 history requests; omitted values preserve the prior default of 128. Zone/metadata lookups remain outside the history-slice budget and must be included in provider quota approval.
5. Review each saved source interval. Failed, saturated, invalid/future or malformed trip/event/drive data remains partial; retry resumes successful slices. Duplicate deliveries must not add crossings or prices. A previously successful window can be re-queried to recover late history.
6. Validate association, UTC assumptions and portal traversal against controlled real movements. Retain unmatched/ambiguous data for review. Do not turn unconfigured geometry or unknown retention into verified counts or monetary charges.

## Release Gates

- Approved staging database/provider scope; actual Mongo index/unique guard execution, process restart and backup/recovery proof.
- Controlled tracker arrival, travel and known tunnel/congestion movements; portal geometry, assignments, timestamp basis and provider retention/quota confirmation.
- Physical Android/iOS PWA update, draft/relogin recovery, queue gating and authenticated PDF/XLSX saves. Native Excel/LibreOffice file opening and required character/font coverage, especially non-Latin PDF names.
- Production-like query/export memory/latency under the real data mix and writer topology. The synthetic 500-job serializer check is not a capacity guarantee.
- Review remaining frontend build-tool advisories before release. Do not force a Tailwind major migration without its own styling/build regression review.
- Client review and explicit push/deploy authorization. No automatic release is part of Phase 9.
