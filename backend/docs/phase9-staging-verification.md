# Phase 9 - Approved Staging Checks

Date: 2026-10-10. Partial staging verification, not complete release sign-off.

## Authorization and Isolation

The user approved the URI in `backend/.env` under `LOCAL_MONGODB_URI_PRE_PROD_SWITCH`, existing MA jobs and submissions, and read-only GPS access. Production `MONGODB_URI` must not be used as a connection target. No Calendar permission, new jobs, GPS changes/imports, notifications, push or deployment is authorized.

The inventory connects directly using the staging variable with no fallback. It refuses matching production host/database targets, including the application's explicit `MONGODB_DB_NAME` override. An explicit staging URI database is preferred. Credentials, customer details, tracker identifiers and coordinates are not printed.

The isolated application verifier maps the approved staging URI into its own process-local application configuration before any application imports. It does not change `.env`, start `src/server.ts`, create indexes or run background integrations. Collection write methods and raw database commands are disabled; aggregate `$out`/`$merge` are rejected. Calendar/email/SMS/storage HTTP calls are disabled. Only five specific GPS read endpoints are allowed, with an eight-attempt ceiling and redirects disabled. No GPS import/sweep runs.

## Observed Results

- Staging connected successfully. MA's `hello@themanvan.co.uk` account is active and has a tracker assigned.
- One existing MA job was found: `TMV-2C303F01F6`, status `READY`, booked 5 September 2026. No recorded actual start/finish, billing snapshot, manual requirement or linked job tracker was present.
- No manual summary exists for that job. The manual-summary unique job index and saved GPS collections are not present yet; index creation was deliberately not performed.
- Production report services executed their real Mongo queries successfully, producing one report job without duplicates. Saved-report GPS coverage correctly remained `unavailable`; direct provider reads were not persisted or presented as saved job evidence.
- PDF and XLSX generators produced valid file signatures in memory: 31,280 PDF bytes and 24,137 XLSX bytes. These staging checks establish generation/signatures, not native app opening or independent complete-document verification; the separate synthetic export suite covers those file-content checks.
- The actual submission service rejected the unfinished job before any write. No completed-job submission, lock/retry persistence or queue release has been claimed in staging.
- Five read-only GPS requests found 10 devices, MA's assigned tracker and six zone definitions. A three-hour window ending at the tracker's latest sample returned three positions, all accepted by the production parser; alerts, trip routes/drives/events were empty. No tunnel/congestion crossings or charge accuracy were established from this quiet window. Provider completeness remains unknown.
- MA's job documents were re-read and compared to their original values; unchanged. Database writes and GPS persistence were disabled throughout.
- Five additional synthetic target-isolation tests passed, without loading `.env` or connecting to a database.

## Commands

Run from `backend`:

```powershell
node scripts/phase9-staging-inventory.cjs
npx tsx scripts/phase9-staging-read.ts
npx vitest run test/phase9-staging-target.test.ts
```

These are manual opt-in scripts, not part of `npm test`. The normal synthetic suite remains isolated from live configuration.

## Next Checkpoint

The user was asked whether to complete MA's existing job through the staging app or approve clearly labelled simulated completion on that existing job. Do not fabricate completion or collect invented payments while waiting for that choice. Once a completed job is available, test actual manual persistence, immutable retries, discrepancies and queue release with staging writes scoped to MA.

Known charged journeys and physical portal configuration are still needed for live tunnel/congestion proof. GPS reading approval is not permission to write checkpoints, backfill GPS collections, modify devices or geofences. Staging index creation, crash durability, authenticated browser/device downloads, native fonts and production-like load remain separate checkpoints. No full Phase 9 completion or release authorization is inferred.
