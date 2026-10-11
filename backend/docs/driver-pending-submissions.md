# Driver Jobs and Pending Submissions

User-authorized release revision, 2026-10-12. Final checks passed; push/deployment is in progress. This supersedes the cross-job blockers and driver-list expiry rules introduced with the recent queue releases; the existing GPS pickup expiry policy is unchanged.

## Final Approved Behavior

- Today keeps the same-day unfinished active job regardless of scheduled finish or an empty-van finish timestamp. Only workflow completion removes it from the active list.
- Later jobs remain read-only in Upcoming, as before. No Start/Continue footer was added to Upcoming.
- Earlier-day records remain in the original Past bucket. No Earlier unfinished jobs section or reopening controls are added.
- Neither another unfinished job nor pending Manual Details blocks starting the driver's visible active job or sending its On My Way notice. Assignment/authentication, future-day restrictions and per-job/driver write locks remain unchanged.
- Completing a job still opens its Manual Details form immediately. No Do later button is provided. Normal navigation is not converted into a work-availability blocker; any unsubmitted required completion remains pending.
- Mobile's left hamburger and the desktop sidebar provide Pending Submissions. It lists all owned completed jobs bearing the manual requirement marker without a locked submission, oldest requirement first. Opening an entry uses the existing job-specific form. After submission, it is removed from the list; drafts, validation and immutable retry/lock behavior are preserved.
- Pending submissions do not automatically redirect the ordinary Jobs list or become the single active job. The legacy pendingManualDetails list property is null for compatibility with cached clients.

The new authenticated GET /api/jobs/pending-submissions returns only job ID, customer name and scheduling/completion/requirement timestamps. It derives driver ownership from the session, never a caller-supplied driver ID. No GPS, liabilities, customer email/phone or full booking descriptions are returned by this list.

No historical statuses, completion evidence, money or locked submissions were rewritten. Admin completion behavior/status labels and rescheduling were not changed in this revision.

## Verification

Backend: all 577 tests across 63 files passed, including real HTTP integration with synthetic persistence for pending reads, authentication, non-blocking next starts, concurrent/immutable submissions, restart and exports. Backend production build passed.

Final full frontend regression: all 382 tests across 77 files passed after correcting a new test's tab-role/refresh-count assertions and removing the unrequested reopening controls. Coverage includes the no-redirect Jobs list, no earlier reopening, active/Upcoming selection, read-only Upcoming, immediate manual form without Do later, draft retention, pending refresh/retry/opening, hamburger navigation, Escape/focus restoration, existing modals and recorded On the Way timing. Both final production/PWA builds and TypeScript checks passed.

Actual phone/browser visual acceptance remains a client checkpoint. The user subsequently explicitly authorized checking, pushing and deploying this final scope. Deployment verification is recorded in plan.md.
