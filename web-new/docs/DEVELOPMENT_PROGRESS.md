# Development progress

Checkpoint for continuing work across sessions. Update it at each milestone.

## Current objective

Production audit (docs/FINAL_AUDIT.md). Branch `claude/amazing-shannon-v25h1c`, based on
`main` `3d0be4e`.

## Done (merged to main)

- PR #13: Aurora Light, Van and Liability modules, scenario PDFs, driver report totals.
- PR #14: Generate Report, verbatim Liability wording, plain page copy.
- PR #15: mobile pass (theme choice on phones, drawer dialog), real driver names in demo data.
- PR #16: Alerts bell "Mark all as read", 320 px fixes.
- PR #17: six-tab driver report, job records, comparison, Drivers cards, Overview gloss.
- PR #18: Driver Breakdown PDF built in the dashboard.
- PR #19: global search (docs/SEARCH.md).
- PR #20: Jobs redesign (docs/JOBS.md); demo week modelled on a jobs export, anonymised.

## Audit (this branch)

Fixed: synthetic demo job references; "Final charge to check" per job; bulk reassign
eligibility; server CSV exports via adminFetch (and served by the demo mock); "Not
priced" uses pricing evidence; payment line uses backend payment status; Liability PDF
wording provenance and `declarationSnapshot` support; Van compliance due state; demo
driver summary follows the range.

Open (backend or approval needed): see docs/FINAL_AUDIT.md section 18.

## Next action

Merge the audit PR once CI passes and check the preview deploy.

## Data findings

- MAN VAN "Revenue Handled £898,990,077.80": confirmed from the jobs export. Job
  `TMV-EBDA41133A` stores a final charge of £898,988,888.00 against priced parts of
  £211.60; the rest of the week adds £1,189.80. Diagnosis and proposed correction in
  docs/FINAL_AUDIT.md section 9.
- Deployed "Total Move Time" equals the report's Working Hours (33h 39m for Tiago in
  the same range), so it is working time, not tracker moving time.

## Not possible from this repo

- The server's own PDF layout (still offered) can only change in the backend.
- Correcting the MAN VAN amount needs the job record fixed in the database.

## Next action

Merge the PR once CI passes; then any follow-up the owner asks for.

## Resume commands

```bash
npm ci && npm run verify
npm run dev   # http://localhost:3001/admin?section=driverreport&driver=KA
```

## Job preview and Job Report redesign
Rebuilt the job drawer (sticky header and tabs, wide mode, grouped badges, summary, validated
contact actions, vertical timeline, duration bars, evidence completeness, gallery with keyboard
viewer, charges and comparison, filtered activity) and the PDF (Job Report). Shared logic in
`jobdetail/model.ts`. Demo jobs TMV-1101 to TMV-1104 cover completed, active, scheduled and
cancelled cases. See `docs/JOB_PREVIEW.md`. Backend still needed: drop-off tracker times, van
registration on the job, typed activity categories.

## Liability record: centred document modal
The Liability record preview (Check In, Check Out, Parking Liability, Liability Reports) is now a
centred dialog instead of a right-hand drawer (Jobs keeps its drawer). Header with scenario,
customer, date and copyable record reference; summary strip; Record details / PDF preview switch;
the PDF view embeds the same `PaperScenarioReport` that Download prints, with page, zoom, fit and
print controls; previous/next record; full screen on phones. The wording block now says the
current approved text is shown and that the version stored at signing is not available.

## Cards, job cards and Drivers navigation
- Card borders: removed the coloured side strips (Operations performance status cards, Needs
  attention rows, job cards). One shared `.tmv-card` surface with a full 1px border; status
  stays on the dot, icon and badge. A test fails if a side strip returns.
- Job cards: driver and schedule in the header, customer, route, then a footer with the job
  reference (shown once, with a copy button) and the labelled amount.
- Drivers: two tabs, Drivers and Performance. Inside Drivers, Cards and Table are view modes
  (`mode=cards|table`). Old links keep working: `view=cards`, `view=directory` (opens the table)
  and `view=performance`. The table gained Contact and a clickable Current / next job column;
  search also matches phone. Performance gained a period summary and driver comparison bars
  built from the same rows as the table. The six-tab Driver Report is unchanged.
- Known limits: no driver availability or on-time metrics (not in the data); declaration
  versions at signing are not stored.

## Driver Performance analytics (Drivers, Performance tab)
Rebuilt the Performance tab as a small analytics dashboard. Data layer: `utils/performanceData.ts`
(tested, including London day boundaries across the clocks going back). Components:
`components/performance/` (KPI cards, ranked bars, charts) orchestrated by
`DriverPerformanceSummary.tsx`.
- Five KPI cards with a comparison to the previous period (only when it loaded), sparklines from
  real daily buckets, and a review ring only when requests are tracked.
- Completed jobs: ranked bars with each driver's share (shares sum to 100% because each job has
  one driver). Colour follows the driver.
- Charges by driver: calculated and final side by side, never combined. Tooltip adds recorded receipts.
- Charges over time: calculated and final per London day from the jobs in the range. Straight
  segments, no smoothing; an unfinished day is "not recorded yet", not £0; jobs without a charge
  leave a gap and are counted in the note.
- Working time: recorded time per driver, average over jobs that have a time only.
- Review requests ring: sent as a share of tracked (sent plus not sent).
- Payment methods ring: money received by method. Invoices are shown apart (billed, not received).
- Sortable driver comparison table (unknown values last), CSV export with separate columns.
- One driver selected: that driver's KPIs, trend, working time, reviews, payments and a
  "View full driver report" action; no comparison charts.
- Every chart has a data table; failed requests show an error with retry, never "no data".
- Backend limits: the trend is by scheduled day from the jobs list (not a server aggregate), so it
  can differ slightly from the summary's scope; a range with more than 3000 jobs is marked partial.
  No on-time %, availability or efficiency score exists in the data, so none is shown.

## Liability preview flow correction

- Root cause: the Job ID cell in the Liability table called `openJob()`, which opens the
  right-side job drawer. The centred record preview was only reachable from the row, the Docs menu
  and Global Search.
- The Job ID now opens the centred Liability preview for that record (all four scenarios). The job
  itself stays one action away: "Open job" in the Docs menu and in the preview footer. From the
  preview it closes the record first, so no dialog stacks over the job drawer.
- No Liability screen mounts a right-side record panel any more. Deep links and Global Search
  results (`?record=`) already used the centred preview.

## Direct driver editing

- Driver cards have an "Edit driver NAME" pencil beside the account badge. One click opens the
  existing Add/Edit driver form (`AddDriverModal`) with that driver's stored name, initials, contact,
  vehicle, device and account status. Profile is not opened first.
- The same handler is used by a pencil in the Table view. The Profile panel's own Edit button,
  Profile and View report are unchanged and separate actions.
- Saving uses the existing `saveDriver` call and refreshes the driver summary and roster queries.
  Initials are never regenerated for an existing driver.
- Tests for the real edit form (`AddDriverModal.test.tsx`): prefill, initials never regenerated,
  validation, saved payload keeps stored initials, vehicle, tracker and status, list refresh,
  save failure keeps entries, Cancel saves nothing.

## Overview date toolbar

- The Overview toolbar is now Today, Yesterday, Last 7 days, then the two date fields. "Last 30 days"
  and the "Custom range" button are gone; picking dates by hand is the custom range, and the preset
  highlight clears unless the dates equal a preset. No backend or London-time logic changed.

## Van: one vehicle view

- Audit: "Needs attention" was a two-chip filter (`All vehicles | Needs attention`) on the one Van
  page, with no data of its own. It was reached by deep links `?section=vehicles&show=attention`
  from the Overview attention panel, Overview "Open vehicles" and Global Search.
- The switch is gone. All Vehicles is the single view. A compact "Needs attention N" toggle remains
  only so those deep links and that workflow keep working (the filter is the same
  `vehicleAttention` rule as before; thresholds are unchanged).
- Each row that is overdue, due soon or has a missing MOT/Tax date now carries a text-labelled
  "Needs attention" marker (red when anything is overdue, amber otherwise) with the reasons for
  screen readers. The amber row tint stays as a second cue only. A missing date is never shown as
  compliant. The Van preview is untouched.

## Notifications audit and Broadcast

- Full matrix in `docs/NOTIFICATIONS_AUDIT.md`. Broadcast already existed in Aurora but only inside
  the Delivery log tab. It is now a header action ("Broadcast notice") on all three views.
- Delivery log restored the customer email address, the SMS number (with a text warning when it
  cannot be dialled) and the driver code, all from fields the API already returns.
- Broadcast modal: zero devices is shown as an error, not a success; sends are guarded against
  double submission. Tests cover review-before-send, success after confirmation, failure, zero
  devices, one-request guard and the audience.

## Jobs: centred dialog

- Jobs now open in a centred dialog (`ds/Dialog.tsx`, used by `JobDetailModal.tsx`, formerly
  `JobDetailDrawer.tsx`) instead of the right-hand drawer. All four tabs, the footer actions,
  the Job Report PDF, deep links (`?job=`) and Back/close behaviour are unchanged; only the
  container changed. Timeline & evidence uses two columns on desktop.
- The `Drawer`'s unused "expandable" mode was removed; the Drawer itself remains for the Driver profile.
- Tests: dialog structure, tabs, Escape, Close and scrim, scroll lock and focus restore, the
  `?job=` route, and the loading and error states. Browser-checked at 1440, 1024, 768, 390 and
  320 px in both themes, including the PDF opened on top and focus trapping.

## Overview: duplicate charts removed

- Audit and matrix: `docs/OVERVIEW_AUDIT.md`. One status visual remains (Operations performance).
  The KPI row no longer repeats the status mix, progress rings or sparklines; it now shows Total jobs,
  Final charges, Recorded receipts and Late arrivals. The duplicate "Today's jobs" tab under Payments
  and timing is gone. The activity legend no longer repeats status counts. Receipts and timing are
  computed once and shared.

## UI inspection of the deployed demo

Inspected `tmv.elevariq.tech` (admin) across Overview, Jobs and the job dialog, Drivers (cards and
Performance), Van, Liability, Alerts, Live Fleet and Settings at 1440, 1024, 768 and 390 px in both
themes: 60 checks, no horizontal overflow, no console errors. Fixes from what was seen:
- Phone, Delivery log: one card per job instead of a squeezed table that clipped the email column.
- Phone, job dialog: the tab suffixes ("& evidence", "& payment") hide below 640 px so all four
  tabs fit; tab padding tightens below 360 px. Full names stay on larger screens.
Seen and left as they are: tables on tablet widths scroll sideways inside their panel (an
app-wide pattern; the Van warning marker sits in the visible Driver column); driver card stats
do not line up across a row when a card has fewer detail lines.

## Activity chat, phase 1

- Audit and specification: `docs/ACTIVITY_CHAT_PHASE1.md`. The backend is not in this repository (nor reachable
  from this session), so no schema, migration or services were written.
- Added `src/lib/activity/`: event catalogue (the confirmed action to event mapping), wire contract and invariants,
  idempotency keys, read and send authorisation rules, and an adapter from the existing `job.activity[]`.
  16 tests, including cross-checks of the catalogue against the real driver workflow and API client source.

## Activity chat, UI (phases 3 to 5)

- Admin Activity workspace, nav item with unread badge, and a locked single-driver "Message driver" composer
  (reuses the Broadcast modal); driver app messages inbox, job activity screen and notification deep link.
  Details, limits and everything not done (backend, real-time, end-to-end): `docs/ACTIVITY_CHAT_UI.md`.
- Dev and demo mock endpoints in `src/mocks/activity.ts`; production shows "not available" without the server.

## Generate Report, phase 1 (correctness)

- Missing invoice money is "Not available", not £0.00; summary lines have a coverage (complete, known-only,
  unavailable) and combined totals keep a separate known subtotal. Partial loads when some drivers fail.
- Dialog state machine: frozen request snapshot, locked controls while loading, Cancel generation, generation
  counter plus abort so late responses never commit, edits discard the result, per-type driver drafts, driver
  list failure/empty/retry states, Overview date prefill kept as given (one-sided and over 93 days).
- Details: `docs/REPORTING.md`. Not done in this phase: CSV totals, PDF column widths, DOCX schema order, retry
  of individual failed drivers, inactive-driver handling in All drivers.

## Generate Report, phases 2 and 3

- Phase 2: real PDF download (no new dependency), separate print lifecycle, CSV with totals sections, Excel and Word
  fixes, reconciliation note and test. Details and verification status in `docs/REPORTING.md`.
- Phase 3: bounded per-driver loading, partial reports with targeted retry, de-duplication and stable ordering,
  validation of server records, inactive-driver choice, explicit date contract per endpoint.
- Still open: real backend check of the date semantics and stable paging, opening the files in Microsoft Excel and
  Word, and the workspace redesign (phase 4).

## Generate Report, phase 4 (workspace UI)

- Two-pane workspace dialog with a real preview (totals, short job table, status), step-numbered options, file
  format tiles, per-driver progress, and explicit loading, partial, error, empty and stale states. Details and what
  was checked: `docs/REPORTING.md` ("The workspace"); screenshots in `docs/generate-report-screenshots/`.
- Not done: opening the Excel and Word files in Microsoft Office, checking the date semantics against the real backend,
  a screen reader pass (only axe and keyboard checks were run), and testing on real phones and other browsers (only
  headless Chromium was used).

