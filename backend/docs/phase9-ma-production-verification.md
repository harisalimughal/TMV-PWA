# Phase 9 - MA Completed Job Read Verification

Date: 2026-10-10. User subsequently authorized MA-only production testing and reported completion of the real job. This check is strictly read-only, not release sign-off.

## Scope and Safety

Opt-in command from `backend`:

```powershell
npx tsx scripts/phase9-ma-completion-read.ts --production-ma-read-only
```

Uses the active `MONGODB_URI` and the application's `MONGODB_DB_NAME` semantics only under the explicit production flag. It loads the MA account, job `TMV-8B626F68AE`, its manual submission, and MA's applicable day report. Report services may read the historical tracker/job context necessary for correct MA evidence attribution; they do not generate reports for other drivers.

No server bootstrap, index creation, job creation, GPS import, notifications, Calendar access or remote writes occur. Database mutators/raw commands/aggregate output stages and all outbound HTTP are blocked. Exports stay in memory; no customer data file is saved. The job and manual record are read again and compared for equality afterward. Live `.env` files are unchanged.

An attempted command to invoke identical/changed submission retries was rejected by the safety reviewer before execution because it exceeded read-only production authorization. All submission-service calls were removed. Live mutation/locking race/crash tests remain unperformed; synthetic tests cover these behaviors. No production mutation attempt ran.

## Results

- Job status and workflow state are both `COMPLETED`.
- Completion's Manual details requirement is present. Exactly one schema submission exists, shown by the report as `submitted-locked`; the unique jobId index exists.
- Submitted timestamp: `2026-10-10T12:54:12.491Z`. Submission ownership matches MA's authorized account.
- Calendar duration and internal allocation are both 300 minutes. Recorded operational working time is 1.5019 minutes; manual duration is 344 minutes. The report exposes the difference, approximately 342.5 minutes shorter in system evidence.
- Stored allocation and overtime block/rate arithmetic passed assertions. System duration is below allocation, so recorded overtime is zero; manual hours do not reprice the immutable system snapshot.
- System collection and manual collection are both GBP 180.00, with no payment-method discrepancy. Manual payment line items sum correctly and agree with the report.
- System expected amount is GBP 50.00. The online-payment flag is true, but there are zero confirmed prepayment records. Prepayment overlap/provenance is flagged; outstanding and excess are deliberately unknown, not zero or a confirmed GBP 130 excess. These source values require administrator/user review, not automatic correction.
- Saved GPS coverage is `sampled`, not complete. The report contains zero confirmed tunnel crossings; this does not prove that no crossing occurred. No provider queries or GPS writes were made.
- MA has no pending required Manual details submission. Two older jobs remain `IN_PROGRESS`: `TMV-0762918433` (25 September) and `TMV-3EBD71CDA0` (28 September). The active-job restriction can still block starting another job; no automatic status repair was performed.
- XLSX generated and reopened with eight sheets and the target job reference present. PDF generated with a valid signature. Native downloads, full independent production-document layout and physical-device acceptance are not claimed by these checks.
- Job/manual records unchanged after verification. Script TypeScript check and `git diff --check` passed.

## Remaining Checks

User/admin review of the timing/payment inputs and older active jobs is required. Physical charged journeys, portal configuration, device/native downloads, staging write/retry/crash/load checks and remaining frontend toolchain advisories are still open. Production data should not be modified to manufacture tests. No push, commit, deployment or release date was authorized.
