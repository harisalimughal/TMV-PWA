# Driver Queue Availability Hotfix

User-authorized urgent fix, 2026-10-12 Asia/Karachi.

The new queue guard previously treated every historical IN_PROGRESS record as an active blocker. The driver list hid earlier-day records, leaving no way to resolve those blockers. Before the recent feature release, starting a job did not perform this cross-job active-status check.

## Policy

- A valid recorded actual finish at or before now releases the active-job blocker without marking the workflow COMPLETED.
- An elapsed scheduled finish releases it, even when later workflow steps were abandoned.
- Historical bookings with missing/invalid scheduled ends no longer block indefinitely; London calendar days determine their age.
- Genuinely ongoing bookings still block overlapping starts. A valid overnight booking remains active until its scheduled end and is exposed in the driver's active list rather than hidden in Past.
- Completed jobs bearing the mandatory manual-details marker still require their locked submission before a new start. Ownership, locks, future-start restrictions and notification rules are unchanged.
- The same policy prevents expired records suppressing current pickup GPS tracking. Expired in-progress records do not occupy the driver's one active card.

No automatic completion/cancellation, financial edits, backdated manual markers or historical cleanup is performed. Admin records retain their original status, evidence and payments for review.

## Verification

All 581 backend tests across 63 files passed; production backend build passed. Coverage includes historical/current-day expiry, exact scheduled-end boundary, recorded finish, invalid/future timestamps, overnight work, London midnight/DST, mandatory manual details, resumable current jobs, active-list selection and pickup tracking.

A read-only evaluation against existing production timing metadata found 13 historical IN_PROGRESS jobs across TI (8), HE (1), RF (2) and MA (2). The new policy classifies all 13 as non-blocking; no records were changed. User explicitly approved pushing and deploying after tests passed. Deployment verification will be recorded in plan.md.
