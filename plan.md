# Driver Reports, GPS Charge Monitoring, and Job Billing Plan

Created: 2026-10-09 (Asia/Karachi). Last updated: 2026-10-11.
Status: Phases 0-8 implemented. Application release c101cfb is deployed; initial production health/auth/core-report/asset checks passed. Phase 9 local integration/compatibility/security/capacity work is verified; actual approved-environment GPS backfill and real provider/device acceptance checks remain pending. See backend/docs/phase9-verification.md and phase9-rollout.md. D07 still excludes new monetary liability intake/admin editing. User explicitly authorized checking, pushing to main and deploying on 2026-10-12 (Asia/Karachi). This release does not certify physical GPS accuracy or authorize a bulk historical backfill.
Owner: TMV PWA project. This file is the execution checklist for subsequent work.

## 1. Working Agreement and Progress Rules

- Read this file before starting or resuming this feature. Preserve accepted requirements and existing user changes.
- Work locally. Do not push, deploy, or publish without the user's explicit instruction.
- Complete the phases in dependency order. An independently deliverable UI phase may progress while an external GPS dependency is pending; record that explicitly.
- Mark `[x]` only after a step's implementation and acceptance checks pass. Code already present is a foundation, not proof that the expanded requirement is complete.
- After each completed step, update the execution log with changed files, checks run, outcome, limitations, and next step.
- Record a changed requirement or assumption in the decision register before changing dependent calculations.
- Keep financial calculations shared between the workflow, dashboard, comparisons, PDF, and Excel.
- Use statuses such as Pending, In Progress, Verified, and Blocked in the execution log. Explain blocked dependencies; continue independent authorized work.
- Changes to this document alone do not authorize implementation or release of the expanded feature.
- The user authorized local implementation on 2026-10-09, one reviewable step at a time. At each handoff, state what to check and wait for that review before proceeding to the next implementation step.
- Recommend the least costly suitable GPT model for each step, based on current official guidance and the step's complexity. This is an engineering recommendation, not a guaranteed model capability threshold.

## 2. Complete Scope and Accepted Requirements

### Driver manual details

- Automatically present a mandatory form after each assigned job is fully completed, linked only to that job.
- Prefill job reference and start time; allow driver corrections to start/end time before submission.
- Prefill editable payment selections and amounts from the existing job payment data.
- Payment controls are checkboxes with an amount field for each selected method, matching the existing job workflow. Support split payments.
- Helper is optional, with a free-text name and optional hours. Report driver and helper totals independently.
- Capture reported congestion charges and extend charge reporting to support tunnel charges and other requested charges.
- Display the wording "Manual details" throughout this workflow.
- Lock the submitted manual record. Admins cannot edit these submitted values.
- Release the next job through the existing queue after submission. Restore a pending form after reload, logout/login, or network interruption.

### Driver reports and comparison

- Keep Driver Settlement / Work Breakdown as a clean all-driver summary.
- Clicking a driver or View report opens a dedicated full-page report; retain date filters and support browser back/deep links.
- Include distinct Performance, Payments, Comparison, Jobs, Tunnel Charges, Congestion Charges, and Penalties & Liabilities sections.
- Summary metrics: completed jobs, total revenue, working hours, moving hours, overtime, arrival delays, review reports sent/not sent, driver hours, helper hours, collections, outstanding, and discrepancies.
- Financial detail: cash, card, link, bank transfers, invoices, base price, overtime, extra charges, expected total, collections, outstanding, and excess collection.
- Interactive charts: revenue/collections trends, payment distribution, completed jobs, working/moving hours, overtime, punctuality, and verification outcomes over time.
- Comparison must place System calculation and Driver manual details on different sides, with a clear separator and aligned field comparisons. Desktop uses two columns; mobile uses labelled stacked sections.
- Clean expandable job history includes customer/route, scheduled and actual timings, payments, overtime, charges, crossings, congestion activity, liabilities, reviews, and completion status.
- Filters: Today, Yesterday, 7 Days, This Month, Last Month, Custom Date Range. Preserve the existing weekly date-filter workflow.
- Exports: complete individual PDF and real Excel (.xlsx) reports, covering summaries, trends/performance data, comparisons, payments, job details, tunnel/congestion records, and liabilities.
- Any job-linked crossing, congestion record, penalty, or other charge opens its associated job details.
- Use TMV design conventions, accessible controls, readable figures/tables, professional spacing, and desktop/tablet/mobile layouts.

### GPS monitoring and verification

- Improve arrival verification, travel duration, and movement recording using available tracker data.
- Display only job-linked tunnel/congestion activity: crossings/entries, timestamps, name/location where available, linked driver/vehicle/job, chargeability, expected amounts, reported amounts, and totals. This scope applies to all counts, charges, summaries, graphs, comparisons, detail tabs and PDF/Excel exports.
- Tunnel detail: total crossings, chargeable crossings, GPS-detected records, manual charges, expected charges, missing/unreported charges, and amount mismatches.
- Congestion detail: entry count, entry/exit times, time inside where supported, chargeable days/activity, GPS records, manual charges, expected charges, and missing/unreported charges.
- Charges use charging rules and qualified activity; an entry counter alone must not determine the amount.
- Compare three sources: GPS/rule-derived expectation, charges recorded during the job, and locked driver manual details.
- Flag potential unrecorded customer charges and items requiring verification. Evidence supports discrepancy detection; it cannot prove an off-app cash transaction or fraud by itself.
- Preserve job-linked events outside chargeable hours with zero expected charge. Unlinked/ambiguous GPS records may remain internal source evidence for later association; exclude them from driver/job reports, counts, charges, totals, charts, visible verification lists, detail tabs and exports. Never invent a job association to include a record.
- Prevent duplicated GPS events, crossings, billable charges, payments, and report totals.

### Calendar duration and extra-time billing

- Driver sees the exact original Google Calendar scheduled duration.
- Admin/internal allocation rounds that duration up to a whole hour.
- Extra time begins only after actual job duration exceeds the internal allocation.
- Bill extra time in 30-minute blocks using the rate from the Calendar booking.
- Dashboard shows original duration, internal allocation, actual duration, actual extra time, billed extra-time blocks, rate/source, and charge in GBP.

## 3. Financial and Timing Definitions

Store currency as integer pence. Store instants in UTC and evaluate/display operational dates in Europe/London, including daylight-saving changes.

### 3.1 Job duration

```text
scheduledMinutes = exact Calendar end minus Calendar start
allocatedMinutes = ceil(scheduledMinutes / 60) * 60
actualMinutes = verified operational finish minus operational start
extraMinutes = max(0, actualMinutes - allocatedMinutes)
billedExtraBlocks = ceil(extraMinutes / 30)
extraChargePence = billedExtraBlocks * resolvedRatePer30Pence
```

Accepted in D04: any positive extra time bills a full 30-minute block. The supplied internal allocation provides the allowance; no additional grace applies to this rule. Calendar rate takes priority, followed by the overtime Pricing Setting and then crew/packing settings. Existing grace settings do not change new allocation-based billing.

Use the recorded finish boundary (normally the Empty Van/job-finish evidence), not the current time at payment, review, or manual submission. Keep GPS arrival, arrival evidence, operational start, van-loaded, finish evidence, customer signature, and workflow completion as distinct timestamps. Investigate their existing meanings before deciding the authoritative billing boundary. A fallback timestamp must be marked unverified.

If the Calendar states an hourly rate, normalize to a half-hour rate. If rate text is absent/ambiguous, expose the rate source and use only an explicitly agreed settings fallback; flag uncertainty instead of guessing. Preserve the rate, booking duration, rule version, and calculation inputs used for a completed job.

| Calendar Duration | Allocation | Actual | Extra | Charge at GBP 55 / 30 min |
| --- | --- | --- | --- | --- |
| 90 min | 120 min | 90 min | 0 min | GBP 0 |
| 90 min | 120 min | 120 min | 0 min | GBP 0 |
| 90 min | 120 min | 150 min | 30 min | GBP 55 |
| 90 min | 120 min | 180 min | 60 min | GBP 110 |
| 90 min | 120 min | 210 min | 90 min | GBP 165 |
| 90 min | 120 min | 240 min | 120 min | GBP 220 |

Reject invalid/negative Calendar durations. Measure positive excess precisely enough that minute rounding does not erase small excess at a billing boundary. Keep actual duration and billed duration separate.

### 3.2 Outstanding and reconciliation

The user's definition is a reporting difference between the expected system charge and manual collections. Show both the positive remainder and the signed difference:

```text
systemExpected = base charge + billed overtime + applicable customer extras
recognizedCollection = driver manual collection + confirmed separate prepayments
signedDifference = systemExpected - recognizedCollection
outstanding = max(0, signedDifference)
excessCollection = max(0, -signedDifference)
systemVsManualCollectionDifference = systemRecordedCollection - comparableManualCollection
```

Example: expected GBP 250 and manual GBP 220 produces GBP 30 outstanding. Expected GBP 250 and manual GBP 280 produces GBP 30 excess collection. Equal totals with Cash/Card differences still require verification.

- Validate what existing amountCharged/paymentBreakdown/paidOnline fields represent before using them as paid cash. An invoice or generated link alone is not proof of receipt.
- Count prepaid/deposit/online amounts once. If manual amounts already include a payment, do not add it again. Display the calculation basis.
- Missing manual details mean Pending submission / Unknown outstanding, not a confirmed zero collection or a confirmed unpaid balance.
- Do not net one job's excess against another job's outstanding; show their sums independently.
- GPS charges are line items within the expected total, not additional amounts to add again after totalCharges already includes them.
- Retain legitimate booking adjustments and their reasons; do not label every authorized discount as driver misconduct.
- Do not turn a collection discrepancy automatically into a debt owed by the driver/customer, a fine, or a resolved liability.

### 3.3 Charging windows provided by the user

| Charge | Days | London Local Window |
| --- | --- | --- |
| Tunnel | Monday-Sunday | 06:00-22:00 |
| Congestion | Monday-Friday | 07:00-18:00 |
| Congestion | Saturday-Sunday | 12:00-18:00 |

Accepted boundary convention (D01): start included, end excluded. Thus tunnel 06:00 is chargeable and 22:00 is outside the window; congestion 18:00 is outside the window.

- Congestion customer fee (D05): count all entries and charge each qualifying job once for an in-job entry during the approved window. Any separately verified authority daily road cost belongs to the vehicle/scheme/London date and must not be confused with the per-job customer fee.
- Tunnels: retain each genuine passage and evaluate the specific tunnel/crossing rule. Do not apply a generic once-per-day cap to tunnel crossings.
- A geofence enter/exit pair is not two crossings. Repeated samples, retries, boundary jitter, and overlapping geofences must not inflate counts.
- Evaluate driving inside a congestion zone during chargeable hours even if entry happened before the window. Occupancy alone does not prove movement; unknown movement stays unverified.
- Split zone occupancy across dates and charging windows. An entry near midnight can affect multiple chargeable dates if supported by movement evidence.
- Unknown zone, tariff, direction, exemption, or vehicle class produces Needs verification and an unknown expected amount, not a fabricated zero.
- Keep the government's expected road cost separate from the company's customer-facing fee where their tariffs differ. The customer fee used for system totals must have an explicit policy.
- Use effective-dated rate/rule snapshots. A future settings change must not silently reprice historical jobs.

### 3.4 Official-rule reconciliation discovered during planning

The requested regular windows are recorded above. Official rules have additional details that the client's schedule does not resolve. They must be reconciled in Phase 0 before treating expected charges as authoritative:

- TfL Congestion Charge is daily, with bank-holiday hours and a Christmas/New Year exception. Source checked 2026-10-09: https://tfl.gov.uk/modes/driving/congestion-charge
- Blackwall/Silvertown charge each direction during the charging window, with a Christmas Day exception, and rate differences by vehicle/direction/payment arrangement. Source: https://lruc.content.tfl.gov.uk/tfl-silvertown-blackwall-resident-leaflet.pdf (verify current rates separately).
- Dartford charges apply to crossings, and amounts depend on vehicle class/account arrangement. Sources: https://www.gov.uk/pay-dartford-crossing-charge/charges and https://www.gov.uk/government/news/dart-charge-dartford-crossing-remote-payment

These references inform the decision register; they do not authorize substituting a tariff or holiday policy for the user's business policy. Avoid copying old prices or using a single generic tunnel amount for different schemes.

## 4. Current Repository Baseline (Inspected, Not Newly Implemented)

- [x] Inspect current driver manual form, summary API/storage, comparison UI, driver aggregation, pricing, GPS ingestion, date picker, and exports.
- [x] Confirm the repository is clean before creating this plan; no interrupted implementation changes were found.
- [x] Confirm manual summaries are present in code, one per job, with helper optional, payment checkboxes/amounts, and locked submission behavior.
- [x] Confirm existing Recharts, TMV admin components, job drawer, scenarios/evidence, GPSLive integration, CSV, and print/PDF foundations.

Observed gaps:

- JobWorkflowScreen.tsx blocks a completion-screen action until manual submission, but jobs.service.ts does not currently enforce the full pending-summary queue/start gate. Verify all entry points.
- driver-job-summary.service.ts currently captures congestion and combined Invoice/Transfer, but no dedicated tunnel items or liability amounts. Combined historical methods cannot be reliably split without evidence.
- drivers-summary.routes.ts categorizes the whole collection by the payment-method string; split payments and Link need correct shared aggregation.
- workflow.engine.ts uses exact bookedMinutes for elapsed overtime, can use Date.now() after the finish boundary, can prorate Calendar overtime, and can skip overtime if the driver does not select it.
- Local P0.1 audit confirms actualStart and actualFinish are first stamped when Arrival and EmptyVan photos are accepted. These are server acceptance times, not necessarily image capture times; accuracy/provenance remains part of P3.5. Complete-job fallback timestamps still require explicit handling.
- Local P0.1 payment audit confirms amountCharged is set in SUBMIT_TOTAL_CHARGES before SUBMIT_PAYMENT. Payment amounts are stored separately; Invoice gets a zero amount and Outstanding status. Do not treat amountCharged alone as confirmed collections.
- completeJob stores actual duration, but the allocation and complete billing audit snapshot required here are absent.
- normalize.ts can use current congestion/tunnel settings for historic job charge selections; add effective snapshots.
- congestion-zone.service.ts suppresses repeated same-day detections for both congestion and tunnels. Its Dartford once-per-day assumption needs correction.
- gpslive-webhook.routes.ts currently handles matching zone_in events for active jobs and first-entry flags. It does not persist the complete entry/exit/crossing history.
- gpslive.ts history requests use finite limits (20 single-device, 500 fleet), with no proven complete history import/pagination. Data coverage must be checked.
- Pickup tracker verification already has device matching, freshness/radius checks, and repeat-report confirmation. Audit edge cases before replacing working behavior.
- Full GPS journey history/moving-time calculation is not implemented in the current integration.
- Parking/liability scenario submissions provide evidence and job linkage, but not a structured monetary ledger with payment/resolution statuses.
- Admin date presets use UTC boundaries and do not expose all requested presets. Reporting date boundaries need London-time handling.
- Current report fetching/printing has row limits. Complete exports must cover all filtered data.
- PDF foundations exist; actual .xlsx generation and complete individual driver exports need implementation.

Primary locations: backend/src/workflow/workflow.engine.ts; backend/src/jobs/{jobs.service.ts,booking.service.ts,pickup-tracker.service.ts,congestion-zone.service.ts,driver-job-summary.service.ts}; backend/src/integrations/{gpslive.ts,gpslive-webhook.routes.ts}; backend/src/admin/dashboard/{normalize.ts,drivers-summary.routes.ts,finance.routes.ts}; web/src/screens/JobWorkflowScreen.tsx; web/src/screens/admin/AdminApp.tsx; web/src/screens/admin/dashboard/{api.ts,types.ts,pages/OverviewPage.tsx,components/DateRangePicker.tsx}.

## 5. Proposed Data and Service Design

Use existing repositories, money/time utilities, auth, dashboard caching, UI components, and Recharts. Add only the records/services needed by this scope.

| Record / Service | Purpose and Required Links |
| --- | --- |
| Job billing snapshot | Original Calendar duration/text, allocated duration, actual boundaries, rate per 30 minutes/source, blocks, amounts, rule version, driver/vehicle identity |
| Driver manual summary | One locked versioned submission per job; times, optional helper, per-method amounts, itemized reported charges, submission time |
| GPS events | Provider event ID, device, event/received times, zone ID/name, entry/exit, location/direction where present, provenance, driver/job attribution and confidence |
| Confirmed crossings / zone visits | Evidence references, entry/exit, duration/movement coverage, linked jobs, duplicate suppression, confirmed/uncertain state |
| Charge obligations and allocations | Crossing or vehicle/scheme/day key, expected road cost, customer fee, rule/tariff snapshot, linked jobs, financial owner/allocation, verification flags |
| Liability records | Stable ID, driver/job, incident date, type/description, optional amount, responsible party, evidence, payment and resolution status, audit history |
| GPS journeys / movement aggregates | Device/time range, source coverage, travel/moving/idle durations, job association, reliability indicator |
| Shared report calculation service | Scope by driver/date, calculate system/manual totals, differences, trends and status counts once, serve UI/PDF/XLSX |

Add unique indexes for provider events, billable obligation keys, manual job submissions, and liability source references. Add scoped driver/job/device/time indexes for report queries. Use atomic insert/upsert handling so parallel deliveries cannot duplicate records.

Preserve historical driver/vehicle identity at the event/job time. Current roster edits, driver initials changes, van swaps, and job reassignments must not rewrite history. Ambiguous/unlinked associations remain internal source evidence, excluded from driver/job reporting until a real job link is established. Use existing stable identities where possible and retain display snapshots.

Proposed APIs: driver summary submission extension; admin driver report summary; paginated job/event/liability details; PDF/XLSX exports. Keep backend authorization and input/range validation on every endpoint. Lazy-load detailed evidence instead of downloading the entire company history.

## 6. Step-by-Step Execution Checklist

### Phase Status and Model Recommendations

Phase 1 is IN PROGRESS, not complete: P1.1 is verified; P1.2-P1.7 remain unchecked. The calculator is not connected to jobs/payments, its snapshots are not yet persisted, and admin duration fields are not yet added. Passing calculator tests does not complete the full phase's workflow and integration acceptance checks.

"Minimum good model" means the lowest capability tier I recommend for executing the complete phase in reviewable steps with the required tests. "Maximum good model" means a higher-capability option when thorough analysis/review is the priority; it is optional, not a requirement to select the highest available reasoning setting. These phase-specific choices are engineering judgments, not official OpenAI minimums or guarantees. Availability depends on the user's account and client.

| Phase | Current Status | Minimum Good Model / Reasoning | Maximum Good Model / Reasoning | Reason for Recommendation |
| --- | --- | --- | --- | --- |
| 0: Inputs and policy | Complete | GPT-6.1 Sol / Medium | GPT-6 Astra / High | Requires interpreting existing data, provider limitations, and financial policies. |
| 1: Allocation and overtime | Complete locally | GPT-6.1 Sol / Medium | GPT-6 Astra / High | Full phase changes shared billing and historical compatibility. Isolated P1.1 alone is suitable for GPT-6 Luna / High. |
| 2: Driver manual details | Complete locally; visual review pending | GPT-6.1 Sol / Medium | GPT-6 Astra / Medium | Coordinates mobile form, ownership, locked writes, retries, and server-side queue gates. |
| 3: GPS history and accuracy | Complete locally; live GPS/portal validation pending | GPT-6.1 Sol / High | GPT-6 Astra / Extra High | External payloads, uncertain evidence, historical attribution, and out-of-order events require careful analysis. |
| 4: Charges and verification | Complete locally; live GPS/database validation pending | GPT-6.1 Sol / High | GPT-6 Astra / Extra High | Monetary rules, daily/per-crossing distinctions, concurrency, and deduplication have high impact. |
| 5: Liabilities | Complete locally under D07; monetary intake/editing disabled | GPT-6.1 Sol / Medium | GPT-6 Astra / Medium | Structured financial records, evidence linking, state transitions, and duplicate prevention. |
| 6: Report API and reconciliation | Complete locally; live integration/load QA pending | GPT-6.1 Sol / High | GPT-6 Astra / High | Shared aggregates, split payments, prepayments, unknown data, and exact total reconciliation. |
| 7: Full-page report UI | Complete locally; client/live-data review pending | GPT-6 Luna / High | GPT-6 Astra / Medium | With verified APIs/design requirements, individual UI steps are well scoped. Prefer GPT-6.1 Sol / Medium if navigation, charts, and responsive integration become complex. |
| 8: PDF and Excel | Complete locally | GPT-6.1 Sol / Medium | GPT-6 Astra / High | Complete exports, pagination, spreadsheet types, and agreement with financial totals. |
| 9: Integration and handoff | Local work verified; external checks pending | GPT-6.1 Sol / High | GPT-6 Astra / Extra High | Cross-phase regression analysis, migrations, realistic end-to-end verification, and release readiness. |

For cost control, use the minimum column first, keep changes narrowly scoped, and use the higher-capability option when tests reveal unresolved failures or a step needs deeper reasoning. Code review and passing acceptance tests are required with either model. Individual simple subtasks within a phase may use Luna even when the full phase recommends Sol.

Current official OpenAI documentation checked 2026-10-09 supports Luna for focused tasks, GPT-6.1 Sol for complex technical work with cost constraints, and Astra for the most demanding work. Sources: [Model selection](https://developers.openai.com/api/docs/guides/model-selection) and [Work/Codex models and reasoning settings](https://learn.chatgpt.com/docs/models). Use the corresponding picker entries or IDs gpt-6-luna, gpt-6.1-sol, and gpt-6-astra when available; no account/model setting is changed by this plan.

### Phase 0: Validate inputs and resolve financial policy

Phase status: COMPLETE. Technical audit, contracts, fixtures and client-policy decisions are recorded. Full evidence is in [Phase 0 audit](backend/docs/phase0-audit.md); response/data types and activation strategy are defined in [Report contract](backend/docs/driver-report-contract.md).

- [x] P0.1 Inventory current field meanings, job lifecycle boundaries, booking rates, existing settlements, payment statuses/prepayments, and manual summaries using code and representative authorized data.
- [x] P0.2 Inspect GPSLive zones and representative event/history/journey payloads through authorized read-only access. Establish timezone, stable event IDs, coordinates, direction, zone names, pagination, API limits, retention, history availability, and tracker update frequency.
- [x] P0.3 Map each known geofence to its scheme/tunnel. Determine whether grouped "Tunnels-Black-Silver" alerts can identify individual tunnels; if not, plan separate geofences and expose Unknown tunnel until resolved.
- [x] P0.4 Resolve D01-D08 below. Record rates and sources, boundaries, holidays, partial-block billing, customer charge allocation, liabilities intake, and definition of driver collections.
- [x] P0.5 Write representative fixtures and expected outcomes for financial/GPS edge cases. Finalize API types and migration strategy before changing money calculations.

Checkpoint 2: read-only configured database and GPSLive audit complete, including representative anonymized financial/duration samples, current geofence identities, published API schema and bounded historical-position/trip samples. Numeric rate-limit/retention guarantees are not published in the inspected schema; timestamp timezone is supported by fresh-sample evidence, not an explicit offset; grouped tunnel identity/direction and gaps remain coverage limitations with defined fallbacks. These limitations are documented, not treated as nonexistent capabilities.

Fixtures are saved in backend/test/fixtures/phase0-cases.json. Six client examples and three anonymized recorded-duration samples run against the standalone calculator. Non-timing cases specify expected future behavior; no financial/GPS engine completion is claimed. Migration preserves historical prices, exempts legacy missing manual entries from automatic blocking, snapshots new rates prospectively, and covers job sync/deletion/reset effects.

Verification: 88 tests passed across six focused files (job-time billing, existing pricing, checkout order, booking parser, GPS device matching and pickup tracker); backend typecheck and audit-script syntax checks passed. Provider calls were read-only; no production workflow or external configuration was changed.

Acceptance: every monetary assumption has an explicit recorded policy; missing GPS capabilities have a documented fallback and truthful UI state. No secret values or customer personal data are copied into this plan.

### Phase 1: Calendar allocation and reliable overtime

Phase status: COMPLETE locally. P1.1-P1.7 implemented and automated acceptance checks passed. Client visual review remains the handoff before Phase 2; browser automation was unavailable in this session.

- [x] P1.1 Add shared duration/allocation/30-minute billing functions and a versioned calculation snapshot using integer pence and precise elapsed time.
- [x] P1.2 Preserve exact Calendar duration in driver views. Add admin allocated duration, actual extra minutes, billed blocks, rate/source, and charge fields.
- [x] P1.3 Apply allocation-based overtime from recorded start/finish boundaries in workflow totals and completion paths. Calculate server expectation even when the driver does not select Extra time; compare any driver-entered time independently.
- [x] P1.4 Normalize Calendar rate formats, hourly/half-hour rates, decimal values, invalid/missing rates, and accepted settings fallback. Rate priority is Calendar rate first; if missing/unusable, read Pricing Settings `OVERTIME_RATE_PER_30`; if that is blank, use the existing crew/packing rate fallback. Label the applied source in the snapshot. Resolver is connected to the workflow and completion paths.
- [x] P1.5 Snapshot values before payment confirmation; exclude time spent on payments, reviews, manual form, and later reloads. Handle admin/manual completions and missing evidence explicitly.
- [x] P1.6 Update normalization, driver/finance summaries, receipts/reports, UI hints and existing pricing tests to consume the shared result. Preserve historical completed values unless a separately authorized recalculation is performed.
- [x] P1.7 Verify the six supplied examples plus 0/1/29/30/31 extra minutes, exact-hour bookings, non-hour bookings, missing rate, hourly conversion, overnight jobs, invalid times, and repeated completion.

Acceptance: a 90-minute booking allocates 120 internally, costs zero overtime up to 120 actual minutes, and bills GBP 55 for 150 minutes when the Calendar rate is GBP 55 per half hour. Driver still sees 90 scheduled minutes.

### Phase 2: Complete and harden driver manual details

Phase status: COMPLETE locally. P2.1-P2.7 implemented and automated checks passed; visual/device review remains the handoff before Phase 3.

- [x] P2.1 Verify the existing automatic trigger and job-prefill flow. Provide prefilled editable per-method amounts and optional free-text helper. Preserve accepted form controls and wording.
- [x] P2.2 Add itemized tunnel and congestion reporting with optional crossing/zone references and amounts collected from the customer. Keep base/payment totals and charge components explicit to avoid counting the fee twice.
- [x] P2.3 Use separate Cash/Card/Link/Bank Transfer/Invoice checkboxes for new submissions where needed to meet financial reporting. Retain historical Invoice/Transfer as Ambiguous combined method; do not guess its category.
- [x] P2.4 Validate unique methods, numeric limits, finite currency, zero/no-payment cases, helper data, boolean inputs, times, and charge items on the backend. Make retries return an existing identical submission or a clear locked-record conflict.
- [x] P2.5 Enforce pending-summary behavior server-side for relevant queue/start endpoints, and restore pending forms across reload/relogin. Prospective per-job completion marker exempts historical completions without a migration or hardcoded historical date.
- [x] P2.6 Handle save errors/retries and repeated taps without duplicate entries; preserve the driver's draft until submission succeeds. Ensure no admin endpoint edits locked manual values.
- [x] P2.7 Verify ownership, incomplete jobs, duplicate/racing submissions, split payments, optional helper, already-paid/no-cash jobs, missing older summaries, and queue release.

Acceptance: a new completed job requires exactly one locked manual submission before the driver starts the next relevant job; failures remain recoverable; helper omission is valid.

### Phase 3: GPS event history and accuracy

Phase status: COMPLETE locally (implementation and fixture checks). Live physical accuracy is not certified. See `backend/docs/phase3-verification.md` before release. Do not count geofence visits as confirmed tunnel crossings until approved portal geometry and sufficient route evidence exist.

- [x] P3.1 Persist qualifying raw entry/exit events before notification/charge deduplication. Separate event time from receipt time. Keep missed/unmatched/out-of-order records recoverable.

Report-scope clarification (2026-10-11): internal recovery of unlinked source records does not authorize their display or inclusion in any report counts, charges, totals, charts, tabs or exports. Apply job-link and historical-driver ownership filters before aggregation and pagination.
- [x] P3.2 Implement idempotent webhook ingestion and bounded history synchronization with retries, checkpoints, and provider limits. Stop reporting full coverage if an import is truncated. Provider completeness remains Unknown even after all bounded queries succeed.
- [x] P3.3 Match by historical device/job time interval; handle READY/on-my-way, active/completed jobs, delayed delivery, van swaps, and multiple possible jobs. Do not attach a delayed event solely to the currently active job.
- [x] P3.4 Reconstruct tunnel passages and congestion visits; handle geofence jitter/overlap, repeated samples, missing exits, and jobs starting inside a zone. Mark inferred visits separately from observed entries. Physical tunnel confirmation is implemented/tested with synthetic portal fixtures; real portal configuration and live-route validation remain external prerequisites.
- [x] P3.5 Audit arrival freshness/radius, timestamp origin, distinct-sample confirmation, clock skew, device identity, stale/parked trackers, pickup geocoding, and proof-upload behavior. Keep arrival evidence alongside GPS verification.
- [x] P3.6 Integrate journey/history movement data. Define approach travel time, on-job travel, moving time, idle time, and working time separately; report incomplete coverage explicitly.
- [x] P3.7 Verify repeat webhook delivery, out-of-order and delayed events, stale/future timestamps, overlapping zones, bounded tunnel signal loss, no tracker, incorrect tracker, and ambiguous job association using automated fixtures. Real tracker/provider and database integration remain release checks.

Acceptance: raw unique events remain visible even when there is no charge or notification; counts reflect confirmed physical activity. Moving time is GPS-derived where supported and otherwise shows Unavailable/Partial coverage.

### Phase 4: Rule-based charges and discrepancy detection

Phase status: COMPLETE locally. Implementation and automated checks passed. See `backend/docs/phase4-verification.md` before progression/release. Authority amounts remain explicitly unknown under D02/D03; no government tariff, exemption, vehicle-class, account or direction assumptions were invented. Physical tunnel proof still requires the Phase 3 portal setup.

- [x] P4.1 Implement supplied Europe/London windows with inclusive starts/exclusive ends and the approved no-customer-holiday-exception policy. Capture effective Pricing Settings snapshots prospectively. Keep unverified authority vehicle/direction/account/exemption dependencies separate and unknown.
- [x] P4.2 Derive tunnel customer obligations per confirmed qualifying passage/scheme. Remove generic daily suppression; retain one fee-window alert per job and durable physical-allocation guards. Geofence-only activity never becomes an automatic toll.
- [x] P4.3 Derive one congestion customer fee per qualifying job, retaining all entry evidence. Keep per-vehicle/scheme/London-date authority references separate, including multiple days/van swaps within a job.
- [x] P4.4 Add durable atomic allocation deduplication using revision compare-and-swap and unique Mongo `_id` scopes. Verify competing jobs/drivers, repeat processing, overlapping/enriched proofs, distinct real passages and immutable saved amounts with fixtures. Live Mongo integration remains a release check.
- [x] P4.5 Compare observed GPS expectation, job-recorded fees and locked manual customer fees. Return Missing charge, Amount mismatch, Manual only, Outside chargeable hours, Duplicate allocation and Needs verification with explanations and evidence IDs through protected admin APIs.
- [x] P4.6 Keep absent GPS, unknown/effective-date rates, fallback boundaries and conflicting allocations unknown; explicit zero remains zero. Expose observed-minimum/unknown-provider-coverage labels and driver-selected-unverified billing sources. Never treat a discrepancy as proven fraud.
- [x] P4.7 Verify boundary instants, weekdays/weekends/holidays, London DST, overnight/pre-window occupancy, repeated entries, multiple real passages, duplicate delivery, signal uncertainty, report read-only behavior, frozen billing, van swaps and concurrent claims. Tunnel proofs straddling charge-window boundaries require verification rather than a guessed crossing time.

Acceptance: all entries/crossings are counted accurately; only qualified activity produces charges. Each qualifying job receives one congestion customer fee under D05, regardless of repeated entries in that job; separate authority daily costs are deduplicated. Repeated genuine tunnel passages are evaluated individually.

### Phase 5: Penalties, liabilities, and other charges

Phase status: COMPLETE locally for the approved D07 scope. Existing parking/liability forms remain evidence-only. Monetary intake and admin amount/status editing are deliberately NOT implemented. See `backend/docs/phase5-verification.md`; approved structured source metadata is a read/import contract, not a new driver/admin intake endpoint.

- [x] P5.1 Add structured job/driver liability records linked to existing parking/damage categories, source IDs, photos/signatures, capture metadata and job deep links. Preserve unknown amounts/responsibility; distinguish notice/risk evidence from confirmed financial records. New submissions capture authenticated driver identity; legacy submitters are preserved without guessing historical initials.
- [x] P5.2 Apply D07: no new monetary liability/parking input and no admin editing of locked manual details or liability amounts. Support only explicitly approved existing-source metadata for amount/type/responsibility and status; malformed/unapproved data stays unknown. Separate audited liability documents never mutate collections or GPS charges.
- [x] P5.3 Deduplicate imports using stable scenario Mongo IDs, deterministic legacy fingerprints, unique source references and approved financial-reference guards. Validate open/disputed/paid/waived/resolved source history; approved append-only status extensions can reconcile without changing amount, ownership or original evidence. Other source changes require verification.
- [x] P5.4 Provide isolated known subtotals, incomplete/null full totals, unknown/duplicate/conflicting source counts and status groups via protected per-job admin APIs, with real job links. Do not add liability figures into customer payment collections, overtime, road fees or manual entries.
- [x] P5.5 Verify unknown versus zero, multiple/repeated incidents, tampered driver amount/approval fields, historical identity, photo/signature/checkpoint links, source conflicts, approved status history, storage failures, bounded partial coverage and exact non-duplicated totals using local tests.

Acceptance: every monetary liability has a source, driver/job, amount/date/type/description and status; unknown historic incident amounts are never fabricated.

### Phase 6: Shared report API and financial reconciliation

Phase status: COMPLETE locally. See `backend/docs/phase6-verification.md` for contract, examples, scope/coverage labels, preview and release checks. This is the shared data/reconciliation foundation, not the Phase 7 dashboard or Phase 8 complete exports.

- [x] P6.1 Build scoped per-driver report service with complete matching-job summaries/trends, per-job comparisons, GPS/movement coverage, charge verification, contextual job links and independently paginated jobs/events/visits/charges/liabilities.
- [x] P6.2 Use a shared split receipt calculator in new reports, normalization, settlement, Finance and Overview. Include Link, keep Invoice uncollected and label derived invoice balances. Update existing settlement CSV/print fields, preserve explicit zero prices and show unknown historic fees without using today's rates. Complete individual PDF/Excel remains Phase 8.
- [x] P6.3 Implement signed differences, separate positive outstanding/excess, missing-summary unknowns, explicit prepayment overlap/global-reference checks, documented price adjustments, original frozen Calendar terms, measured/manual work times and optional free-text helper totals. A paid-online flag is not a receipt; unresolved prepayment provenance leaves outstanding unknown with the known-only gap shown separately.
- [x] P6.4 Use recorded operational start (else booking) for financial/job/performance cohorts, event occurrence for GPS and approved incident date (else labelled submission) for liabilities. Convert date filters to actual instants, retain existing inclusive London weekly filters, and use explicit exclusive ends in the new API. Context jobs/authority references never add their financial totals twice.
- [x] P6.5 Save prospective completion identity snapshots, preserve them/prepayment metadata through sync, add scoped indexes and range/capacity/pagination guards. Admin auth is mounted using existing middleware. Single-flight only in-progress requests; no stale cross-request cache. API has empty/error/partial states; existing views retain loading states and the new full report UI is Phase 7. Live Mongo query/auth/load testing remains a release check.
- [x] P6.6 Verify full-range versus detail/trend/receipt totals with synthetic tests, integer-pence arithmetic/overflow guards, zero/unknown amounts, no cross-job excess netting, isolated liabilities, stale audit references, historic ownership, partial GPS, invalid ranges and query shape/capacity guards. Browser-check the isolated settlement print fixture; actual database execution and full export verification are later integration checks.

Acceptance: one backend calculation supplies all surfaces, filtered totals cover the complete range, and displayed numbers explain their source and missing-data coverage.

### Phase 7: Full-page Driver Reports UI

Phase status: COMPLETE locally. See `backend/docs/phase7-verification.md` and the synthetic preview at http://127.0.0.1:5179/phase7-check.html. Client acceptance and authenticated live/test-data integration are still release checks; no deployment was authorized.

- [x] P7.1 Replace Overview's inline Work Breakdown/Comparison with a clean Driver Settlement summary and report/compare actions. Driver roster cards/name buttons open the same report; existing edit/deactivate/delete/contact controls retain their behavior.
- [x] P7.2 Add dedicated driverreport navigation, URL-backed driver/range/tab/group/independent pages, browser popstate restoration and real job detail links. Summary/roster date selections are retained in their URLs.
- [x] P7.3 Add measured performance and financial cards, scheme-specific GPS/charge counts, liability subtotals, comparison differences, pending submissions and unknown/partial coverage indicators with TMV branding.
- [x] P7.4 Implement aligned System calculation / Driver manual details rows with a vertical separator, selected-range totals, signed/outstanding/excess figures, helper/payment values, pending/locked states and field highlights. Mobile stacks labelled sections. Job comparisons expand individually rather than creating another wide spreadsheet.
- [x] P7.5 Add all seven report views with independent lists, pagination, linked jobs, charge review notes and readonly incident evidence. No monetary liability intake or manual editing was added.
- [x] P7.6 Add Recharts revenue/jobs/working/moving/overtime trends, daily/weekly/monthly grouping, payment distribution and accessible trend values. Missing moving data shows Unavailable, not a zero trend; no invented performance score.
- [x] P7.7 Add expandable job history with Calendar/allocated/actual/overtime, prices/receipts/adjustments, review status, GPS activity and lazy linked incident evidence. Crossing/zone/penalty records link to existing job details; incident photos/signatures render where supplied.
- [x] P7.8 Extend shared London-time presets for Today, Yesterday, 7 Days, This Week, This Month, Last Month and custom dates, retaining Tomorrow for existing workflows. Seven days includes today; DST/local-day boundaries are tested. The report adapter converts inclusive UI ends to the API's exclusive timestamp end.
- [x] P7.9 Pass focused loading/error/empty/pending/readonly, keyboard tab/focus, range/history and pagination tests. Browser-check desktop 1440x1000, tablet 768x1000 and mobile 390x844; inspect aligned/stacked comparisons, charts, long names, error recovery and unavailable GPS without whole-page overflow. Actual hardware, real images and authenticated data integration remain release checks.

Acceptance: a driver opens a full report instead of nested wide tables; administrators can trace every job-linked charge to evidence; comparison sides and discrepancies remain readable at all supported widths.

### Phase 8: Complete PDF and Excel exports

Phase status: COMPLETE locally. See `backend/docs/phase8-verification.md`. Live authenticated downloads, native Excel/mobile-browser validation and capacity/load testing remain Phase 9 release checks.

- [x] P8.1 Export the full filtered driver dataset directly from getDriverReport, retaining generated time, London range, identity, sources and rule/coverage notes. Ignore UI detail pages/scheme filters; no top-N/job truncation. Existing range/source limits refuse oversized datasets explicitly; PDF also refuses more than 3,000 pages rather than returning a partial file.
- [x] P8.2 Implement server-generated PDF attachments with repeated contextual headers, page numbering, GBP figures, aligned two-sided comparison/discrepancy highlighting, five performance trend plots plus full data, jobs, payments, charge evidence and liabilities. Empty reports have explicit no-records states. Add real download/loading/error controls to the report page.
- [x] P8.3 Implement actual .xlsx with all eight specified sheets, numeric GBP/duration cells, readable labelled headers, primary-table filters, frozen first four rows, wrapped text, London/source timestamps and GBP formats. Header sizing handles narrow/empty sheets. No financial recalculation or intake is introduced.
- [x] P8.4 Include frozen rate/rule/calculation components, boundary provenance, prepayment references, manual status, source event/visit/job/liability IDs, unknowns and verification notes. Retain only job-linked unclassified GPS evidence and context job links without adding them to financial totals. Exclude unlinked activity and raw provider payloads. Sanitize formula-like text; reject oversized strings/non-finite numbers or unsafe Excel monetary precision.
- [x] P8.5 Test and independently reopen empty, 3-job and 105-job PDF/XLSX files; verify every job/source reference, long descriptions, all eight sheets, numeric cell types, filters/frozen rows, no injected formulas, matching financial sums and footer/page integrity. Render PDF summary/comparison/continuation pages and all eight workbook views; inspect desktop/mobile controls. Synthetic preview uses the same report snapshot as its downloads. Native application/live session checks are explicitly deferred to Phase 9.

Acceptance: both formats contain the whole selected report, open correctly, and reconcile to the dashboard without truncation or duplicated charge lines.

### Phase 9: Integration, compatibility, and local handoff

Phase status: LOCAL WORK VERIFIED; NOT FULLY SIGNED OFF. P9.2 live backfill and the external release gates remain open. After initial synthetic-only checks, the user approved staging checks, then MA-only production verification. Partial results are documented in backend/docs/phase9-staging-verification.md and phase9-ma-production-verification.md. Production verification is read-only; no synthetic payments, job creation, Calendar updates or GPS imports/changes are authorized.

- [x] P9.1 Define the prospective cutover as the UTC instant of a future explicitly approved release; actual date remains unapproved. Document schema/rule versions, additive unknown/default handling, PWA/frontend-backend compatibility, existing-payment protection and marker-based manual activation in backend/docs/phase9-rollout.md. Verify legacy zero-price/completed records and immutable manual retries.
- [ ] P9.2 Execute approved-environment GPS backfill only where history is actually available and confirm coverage/physical portal association. Pending isolated database/test tracker/provider scope and explicit approval; no live backfill has run.
- [x] P9.2-local Implement bounded dry-run planning with stable IDs, no apply capability, source budgets and legacy first-entry evidence labels. Verify idempotent checkpoint recovery and partial coverage for invalid/future/saturated/malformed history; never invent historic crossings or today's tariffs.
- [x] P9.3 Pass full backend (485 tests/50 files) and frontend (199 tests/46 files) regressions and both builds. Backend tests are isolated from live .env/external HTTP. Patch compatible advisories: backend full audit and frontend production-only audit are clean; seven frontend build-tool advisories needing deliberate toolchain review remain visible.
- [x] P9.4 Exercise production routers/auth/session/billing/completion/manual/queue/report/export via actual loopback HTTP and synthetic persistence. Verify concurrent identical insertion, locked conflict, module/listener restart, signed cookie renewal/revocation/expiry/malformed handling, cross-driver denial, legacy pricing and matching XLSX/PDF contents. Real Mongo/process-crash durability is an external release gate, not claimed by this test.
- [x] P9.5 Browser-inspect synthetic reports at 1440x1000, 768x1000 and 390x844, with within-viewport widths and correct comparison separation/stacking. Check long liability text and safe missing arrays; repair the incomplete synthetic liability/GPS fixture and scheme pagination. Physical-device/real-image/native-download checks remain external gates.
- [x] P9.6 Exercise 500-job serializers and independent empty/3/105-job file recovery checks. Reduce observed memory peak about 46% through streamed PDF pages, default to one export slot, and reject over-budget worksheets/PDFs without truncation. Document observed capacity versus real deployment guarantees, import recovery, pause/compatible rollback controls, single-writer assumptions and unresolved external gaps.
- [x] P9.7 Deliver local verification, rollout/compatibility/recovery notes, preview and repeatable commands in backend/docs/phase9-verification.md and phase9-rollout.md. Keep the actual backfill, device/font/native application, real database/portal/load/security-toolchain and release-approval gates explicitly open.

Acceptance: local checks pass, financial examples and GPS edge cases pass, historic records stay intact, and all unmet external dependencies are visible. Push/deploy remains pending the user's instruction.

## 7. Decision Register

Decisions marked Pending block only their dependent monetary/GPS behavior. They do not block documentation, UI structure, fixtures, or other independent work.

| ID | Decision | Current Status / Proposed Handling |
| --- | --- | --- |
| D01 | Timezone and regular windows | Resolved 2026-10-09: use the user-provided schedule in Europe/London. Start boundary is included and end boundary is excluded, so a timestamp exactly at opening is chargeable and exactly at closing is not. |
| D02 | Monetary tunnel/congestion tariffs | Resolved 2026-10-09: customer charges use Pricing Settings values at the job snapshot time. Current observed values are GBP 18 congestion and GBP 13.60 generic tunnel. Authority road costs remain separate verification data when enough vehicle/account/direction evidence exists. |
| D03 | Holidays and exceptions | Resolved 2026-10-09: use the user's supplied regular schedule for customer charging. Do not add official holiday exceptions to customer fees unless later requested; official/tariff exceptions may still be shown separately as authority-cost verification notes. |
| D04 | Partial extra-time blocks and grace | Resolved 2026-10-09: any positive extra time is rounded up to a full 30-minute billing block. Calendar rate is first source. If no usable Calendar rate exists, read Pricing Settings `OVERTIME_RATE_PER_30`; if that is blank, use the existing crew/packing rate fallback and label the source. No additional grace has been approved. |
| D05 | Customer charge allocation | Resolved 2026-10-09: customer charge is job-based. If the driver enters congestion during a job in a chargeable window/day, charge that job. Tunnel charge applies per confirmed chargeable tunnel crossing associated with the job. No fleet-level daily congestion allocation is used for customer charging in this implementation. |
| D06 | Collections, invoices, and prepayments | Resolved 2026-10-09: manual payment amounts are per job and represent that job's manual entry/collection. Existing system fields still distinguish final customer price, driver-recorded payments, invoice/outstanding rows and any independently confirmed prepayments; never fabricate a prepaid amount or count one payment twice. |
| D07 | Liability intake and resolution | Resolved 2026-10-09 for this scope: do not collect driver-entered liability/parking amounts now. Existing incident forms remain evidence-only with unknown amounts unless an amount already exists from another approved source. Admin liability editing/intake is left out of the current implementation. |
| D08 | GPS capabilities and billing timestamps | Technical audit complete: positions/trips and coordinate-bearing trip events available; regular alerts lack coordinates; sampled timestamps align with UTC. Median sample interval 17 seconds, max gap 614 seconds. Retention/quotas unspecified; grouped tunnel identity/direction may remain unknown. Existing operational start/finish are server photo-acceptance times with documented provenance; physical accuracy work remains Phase 3. |
| D09 | Manual details gate activation | Local Phase 2 implementation: driver/admin completion writes `manualDetailsRequiredAt` atomically with the completed job record. Only completed jobs bearing that marker require submission before another job starts. Older already-completed records are not backfilled or used to block drivers. Activation occurs when this code is explicitly released; no release has occurred. |

## 8. Risk, Effort, and Feasibility

Overall: medium-to-high risk because this changes money calculations, driver workflow gates, historical reporting, and external GPS interpretation. Most UI work is low-to-medium risk; billing, physical crossing reconstruction, attribution, and duplicate prevention are high-risk areas requiring focused tests and fixtures.

The dashboard, comparisons, job billing rules, manual form, APIs, and exports are fully achievable in this codebase. Confidence is high for those application features. GPS completeness, precise historical moving time, individual tunnel identity, and recoverable older events depend on tracker/provider data; Phase 0 establishes what can be confirmed. GPS outages or missing historical data cannot be repaired by inventing records, and off-app cash collection cannot be proven from GPS alone.

Planning estimate for one engineer familiar with this repository, with required data/policies available and no provider changes:

| Work Package | Indicative Engineering Days |
| --- | --- |
| Policy/data audit and fixtures | 1-2 |
| Calendar billing, manual form hardening, reconciliation | 2-3 |
| GPS history, crossings, charge rules and verification | 3-5 |
| Liabilities, report API and full dashboard | 3-5 |
| Complete exports, integration/responsive QA | 2-3 |
| Total sequential estimate | 11-18 |

Allow roughly 3-4 calendar weeks for the complete scope plus client verification; external GPS setup, unavailable history, or delayed tariff decisions can extend this. These are estimates, not a promised completion date or tool-running time. A dashboard/comparison increment using existing data may be reviewable in 2-4 engineering days, but it does not complete GPS accuracy, liability accounting, and export requirements.

Reduce risk through shared deterministic calculations, prospective rule activation, saved historical snapshots, idempotent ingest, explicit unknown states, representative fixtures, and a local review before authorized release.

## 9. Requirement Coverage Map

| Requirement | Execution Steps |
| --- | --- |
| Mandatory manual form, optional helper, checkbox split payments, locking/next job | P2.1-P2.7 |
| Driver/system comparison with separator, totals and flags | P6.3, P7.4 |
| Original/allocated/actual durations and 30-minute billing | P1.1-P1.7 |
| Arrival accuracy, travel duration, vehicle movements | P0.2, P3.3-P3.7 |
| Crossing/entry counts, times, names/locations, job links | P3.1-P3.4, P7.5-P7.7 |
| Chargeable windows/days and rules rather than entry counts | P4.1-P4.7 |
| GPS versus job/manual verification and potential unreported fees | P2.2, P4.5-P4.6 |
| Congestion dwell time, pre-window driving, repeated entries | P3.4, P4.3-P4.7 |
| No duplicated charges across jobs/drivers and repeated GPS events | P3.1-P3.4, P4.2-P4.4, P6.6 |
| Penalties/parking/fines/damage/other liabilities and statuses | P5.1-P5.5 |
| Clean all-driver summary and dedicated full report | P7.1-P7.3 |
| Performance cards, charts, financial figures and outstanding | P6.1-P6.6, P7.3-P7.6 |
| Job history, reviews, completion status, evidence navigation | P7.5-P7.7 |
| Requested date presets plus existing weekly filters | P6.4, P7.8 |
| Complete individual PDF and Excel exports | P8.1-P8.5 |
| Responsive, accessible, TMV-consistent UI | P7.9, P9.5 |
| Historical compatibility and release only on instruction | P9.1-P9.7 |

## 10. Execution Log and Next Step

| Date | Step | Status | Evidence / Next Action |
| --- | --- | --- | --- |
| 2026-10-09 | Repository and charging-rule review | Verified for planning | Read-only code inspection; clean git baseline; official sources linked above. No implementation/test run claimed for expanded scope. |
| 2026-10-09 | Complete execution plan | Complete | Requirements, formulas, dependencies, checklist, coverage map, policy decisions, risk and effort documented. |
| 2026-10-09 | Checkpoint 1: local audit and isolated P1.1 | Verified | Added backend/src/jobs/job-time-billing.ts and backend/test/job-time-billing.test.ts. New calculator tests: 40 passed; existing pricing tests: 5 passed; backend typecheck passed. Initial sandbox test startup failed with spawn EPERM; approved retry passed. No current workflow, UI, database, or external service behavior changed. |
| 2026-10-09 | Phase-status clarification and model recommendations | Complete (documentation only) | Phase 1 explicitly remains In Progress with only P1.1 complete. Added minimum and maximum good model/reasoning recommendations for phases 0-9 based on current official guidance and project complexity. No implementation steps advanced in that checkpoint; later P0.4 decisions recorded below. |
| 2026-10-09 | Checkpoint 2: Phase 0 technical audit | Verified | P0.1/P0.2/P0.3/P0.5 checked. Added read-only audit utility, evidence report, endpoint/data/migration contracts and financial/GPS/liability acceptance fixtures; timing tests consume client and recorded-duration cases. 88 tests across six files and backend typecheck passed. No data/provider writes. |
| 2026-10-09 | P0.4 decisions | Complete | User approved full 30-minute block billing for any partial overtime, fallback from missing Calendar rate to Pricing Settings, no driver liability-charge intake for now, job-based congestion charging during supplied windows, tunnel per confirmed crossing, supplied schedule only for customer charging, and per-job manual payment basis. |
| 2026-10-09 | Checkpoint 3: P1.4 rate resolution | Verified | Added backend/src/jobs/job-time-rate.ts and backend/test/job-time-rate.test.ts; extended job-time-billing.ts rate-source labels. Calendar first, overtime setting next, blank override falls back to crew/packing settings. Hourly rates normalize to half-hour rates; half-penny conversions round to the nearest penny. Ambiguous Calendar text retains a verification flag; invalid explicit settings stay unknown. 80 focused tests passed across rate, duration and existing pricing tests; backend typecheck passed. Sandbox spawn EPERM required an approved retry. No runtime integration or data writes. |
| 2026-10-09 | Checkpoint 4: remaining Phase 1 | Complete locally | Connected job-billing.service.ts to checkout, driver completion and admin finish. Snapshot preserves recorded times, allocation, normalized rate/source, rule version and identity; driver-reported overtime remains separate. Calendar sync preserves snapshots/payment splits, re-reads under the existing job lock, and freezes original Calendar overtime terms after arrival. Normalization supplies saved results to driver/finance summaries; job drawer, print report, backend job PDF, completion email and CSV include the breakdown. Full backend suite: 213 tests passed at the broad regression checkpoint; subsequent changes passed focused suites (59 rate/pricing, 9 normalization/completion, 39 workflow/admin, 20 sync/start/queue, 16 photo/checkout tests). Frontend: 23 tests passed across four relevant files, followed by 13 passed after the final duration-display change. Backend/web typechecks and production web build passed. Preview HTML and transformed fixture returned HTTP 200. No production/data writes, push or deploy. Browser automation unavailable; screenshots and physical-device review not claimed. |
| Pending | Phase 1 client visual review | Next handoff | Open http://127.0.0.1:5176/phase1-check.html. Check 90/120 minutes -> GBP 0 extra; 121/150 -> GBP 55; 151/180 -> GBP 110; driver booking remains 1h 30m. Check mobile width and Report preview (billing has its own page). This fixture uses local sample data and makes no backend calls. Then proceed to P2.1-P2.7 when instructed. |
| 2026-10-09 | Phase 1 handoff | Accepted for progression | User instructed proceeding to Phase 2. Screenshot/physical-device checks remain part of later integration QA; no unsupported visual verification claim. |
| 2026-10-09 | Checkpoint 5: Phase 2 | Complete locally | Added extracted DriverJobSummaryForm with London-time inputs, booking-start prefill, editable split payments, optional free-text helper, itemized charges, local drafts and zero-payment selection. Backend validates/locks version 2 records, handles identical retries and Mongo duplicate-key races, excludes invoice amounts from collections and never adds charge components again. Added prospective manual-details-gate service, completion marker, per-driver queue mutex and restore/navigation paths. Calendar sync retains the marker; normalized admin data retains new items and separate methods. Full backend suite passed 259 tests across 26 files; follow-up submission/queue suite passed 41 tests. Frontend focused suite passed 20 tests, final form/workflow suite passed 11, existing workflow/card/list suite passed 8. Backend/web typechecks and production web build passed. Local preview HTML/transformed module returned HTTP 200. No production writes, push or deploy; browser screenshots unavailable. |
| Pending | Phase 2 client visual review | Next handoff | Open http://127.0.0.1:5177/phase2-check.html. Check optional helper, editable prefilled payments, separate Bank Transfer/Invoice, congestion/tunnel entries, collected total excluding invoices, reload draft recovery, and locked success view. Fixture is isolated sample data with no backend calls. Next implementation phase is Phase 3 only after user direction. |
| 2026-10-09 | Phase 2 handoff | Accepted for progression | User explicitly authorized Phase 3 implementation. Earlier visual/device review remains a release check, not a blocker to this authorized local implementation. |
| 2026-10-09 | Checkpoint 6: Phase 3 | Complete locally | Added raw GPS ledger, idempotent webhook ingestion, bounded resumable history imports, historical IMEI/driver assignment intervals, geofence visit reconstruction, configured portal traversal proof, movement coverage and stronger pickup-arrival checks. Added protected admin history/job-monitoring/import endpoints and bounded background synchronization. Final full backend regression passed 302 tests across 31 files, including arrival cleanup and monitoring coverage checks. Backend and web builds passed; affected dashboard tests passed 13 tests across three files. See backend/docs/phase3-verification.md for final verification and external prerequisites. No backend server started, private provider import, production write, push or deploy. |
| Pending | Phase 3 review checkpoint | Next handoff | Review backend/docs/phase3-verification.md, especially portal geometry, UTC provenance, partial coverage and arrival evidence. Next unchecked implementation step is P4.1 only after user direction. Live GPS validation requires an isolated test database and approved tracker/portal configuration; do not run backfills against production implicitly. |
| 2026-10-09 | Phase 3 handoff | Accepted for progression | User explicitly requested Phase 4. Live portal/provider/database checks remain release prerequisites, not claims of completed physical validation. |
| 2026-10-09 | Checkpoint 7: Phase 4 | Complete locally | Added road-charge.rules/tariff/repo/service, prospective frozen job rates, one-per-job congestion and per-confirmed-crossing tunnel expectations, authority reference separation, revision-CAS allocation guards, protected read/reconcile APIs and discrepancy evidence. Integrated qualifying observed fees into new-job totals and saved charge snapshots without repricing accepted historic totals. Removed generic cross-job daily notification suppression and pre-job occupancy fee suggestions. Calendar sync preserves tariffs. Final backend suite: 378 tests across 35 files; backend typecheck/build and web typecheck passed. git diff --check passed. No backend server startup, live import/database write, push, commit or deploy. |
| Pending | Phase 4 review checkpoint | Next handoff | Review backend/docs/phase4-verification.md and the fee examples. Confirm the per-job/per-crossing results and unknown-data behavior before instructing the next phase. Phase 5 must honor D07: no new driver-entered parking/liability amounts or admin editing of locked manual details. Phase 6/7 still own shared reporting and the side-by-side UI. |
| 2026-10-09 | Phase 4 handoff | Accepted for progression | User instructed Phase 5 implementation carefully. D07 remains in force; this did not authorize new monetary liability intake or administrative editing. |
| 2026-10-09 | Checkpoint 8: Phase 5 | Complete locally under D07 | Added liability model/repository/service, protected per-job read/explicit reconcile routes, source/financial-reference indexes, authenticated submission identity snapshots, evidence links, unknown-cost handling, isolated totals and audited approved-status extensions. No new forms, amount entry or status editing endpoints. Final full backend regression: 411 tests across 39 files; backend typecheck/build and web typecheck passed; git diff --check passed. Tests use synthetic sources and mocked persistence. No backend server, live database import, provider write, push, commit or deploy. |
| Pending | Phase 5 review checkpoint | Next handoff | Review backend/docs/phase5-verification.md: notices/risk evidence are not confirmed monetary liabilities, unknown is not zero, historical submitters are not reassigned to today's driver, and liability totals remain separate from collections. Next unchecked implementation step is P6.1 only after user direction. Keep intake/editing disabled. |
| 2026-10-09 | Phase 5 handoff | Accepted for progression | User authorized Phase 6 implementation carefully/professionally. No new liability/prepayment intake, admin manual editing, production import or release authorization was inferred. |
| 2026-10-09 | Checkpoint 9: Phase 6 | Complete locally | Added reports model/payment/repository/service/road-allocation reads and protected driver-reports route. Shared receipt accounting fixes split Cash/Card/Link/Bank/Invoice totals; report summaries cover every matching job before pagination and preserve historical identity, discounts, zero prices, rates, missing/manual/prepayment uncertainty and separate liabilities. Existing settlement CSV/print shows Link, Invoice Pending and unknown fee subtotals. Fixed clock-dependent old notification fixtures and timezone-string range filtering. Final full backend suite: 450 tests across 43 files; frontend: 16 tests across five files; backend/web builds passed. Isolated preview HTTP 200; browser checked at 1280x900 and 390x844 (print fixture uses horizontal overflow on mobile). No backend server/live database import/provider write, push, commit or deploy. |
| Pending | Phase 6 review checkpoint | Next handoff | Read backend/docs/phase6-verification.md and open http://127.0.0.1:5178/phase6-check.html. Verify Cash GBP 100 + Card GBP 50 + Link GBP 50 = GBP 200 collected, Invoice GBP 100 remains pending, and billed price GBP 300 is separate. Review outstanding/excess, missing manual and prepayment examples before instructing Phase 7. Minimum/maximum model guidance remains the Phase 6/7 rows above. |
| 2026-10-10 | Phase 6 handoff | Accepted for progression | User requested Phase 7. D07, no push/deploy and staged progression remain unchanged. |
| 2026-10-10 | Checkpoint 10: Phase 7 | Complete locally | Added typed report client/page/view, aligned comparison renderer/CSS, clean settlement entry point, report/compare links, URL navigation, seven view sections, Recharts trends/payment distribution, scheme-aware server pagination and lazy job evidence reads. Updated London presets and removed obsolete inline breakdown/comparison code. Backend: 452 tests across 44 files; frontend focused/regression: 23 tests across six files; backend/web builds passed. Browser inspected synthetic data at desktop/tablet/mobile sizes, checked missing GPS/errors/long names and nonblank charts. Preview HTTP 200. No backend startup, production data writes, push, commit or deploy. |
| Pending | Phase 7 client review | Next handoff | Open http://127.0.0.1:5179/phase7-check.html and read backend/docs/phase7-verification.md. Check comparison separation/alignment, payments, job expansion, charge evidence, incident unknowns, date filters and mobile stacking. After user direction, begin P8.1 complete PDF/Excel exports; do not add fake or disabled download controls prematurely. |
| 2026-10-10 | Phase 7 handoff | Accepted for progression | User authorized Phase 8 implementation. No push/deploy, live database/provider writes or liability/manual editing were authorized. |
| 2026-10-10 | Checkpoint 11: Phase 8 | Complete locally | Added complete export projection, PDFKit/ExcelJS generators, admin-authenticated read-only attachment endpoint and UI download lifecycle. Export files use all matching service rows, frozen calculations and explicit unknown/coverage states. Added independent pypdf/openpyxl checks and workbook/PDF rendering; 0/3/105-job samples reconcile. Full frontend suite: 197 tests across 46 files. Final full backend suite: 467 tests across 47 files; both builds passed. Corrected an old test's missing-versus-zero fixture and added zero-price coverage without changing its runtime helper. Scoped ExcelJS UUID security override removes the newly introduced advisory; 16 existing backend audit advisories remain for release review. No backend server/live import/provider writes/push/commit/deploy. |
| Pending | Phase 8 client review | Next handoff | Open http://127.0.0.1:5180/phase8-check.html (fixed synthetic 9 October dataset) and read backend/docs/phase8-verification.md. Review PDF/Excel downloads, two-sided comparison, sheet names/types, pending/unknown records and full 105-job coverage. Smaller examples use ?count=3 or ?count=0. Phase 9 begins only after user direction; release remains unauthorized. |
| 2026-10-10 | Phase 8 handoff | Accepted for progression | User requested Phase 9 work. Local/synthetic integration work is authorized; no production backfill, provider write, push/deploy or liability/manual editing is authorized. Asked about an isolated staging setup; continued synthetic checks without inferring approval. |
| 2026-10-10 | Checkpoint 12: Phase 9 | Local work verified; external gates pending | Added real HTTP integration with actual routers/session cryptography and synthetic repositories, safe test environment/network guard, rollout/pause controls, bounded backfill proposal, import coverage fixes, first-entry provenance, auth error/expiry/cookie hardening, workbook budget and streamed PDF pages. Fixed long liability rendering/fixture shape. Backend: 485 tests/50 files; frontend: 199 tests/46 files; both builds passed. Compatible security patches clear backend full and frontend production audits; seven frontend build-tool advisories remain for a separate deliberate migration/review. 500-job observed serializer RSS falls from about 694 MiB to 375 MiB; real deployment load is not certified. No configured backend startup/live import/provider write/push/commit/deploy. |
| 2026-10-10 | Phase 9 testing scope | Synthetic only confirmed | User answered: Keep testing synthetic for now. Continue without live database/tracker/provider operations; leave P9.2 and external release gates open until separately approved. |
| 2026-10-10 | Phase 9 staging follow-up | Read checks passed; completion checkpoint pending | User subsequently approved LOCAL_MONGODB_URI_PRE_PROD_SWITCH, MA existing jobs/submissions and read-only fleet GPS. Verified staging target isolation, active MA account, one READY job, real Mongo report queries, PDF/XLSX generation signatures, unfinished-job submission denial and three valid GPS positions from five read requests. Jobs unchanged; no GPS persistence/index creation/Calendar/new jobs/notifications/production connection. Five target safety tests passed. Requested the user's choice for completing the existing staging job; manual persistence/queue release and known chargeable journeys remain unverified. See backend/docs/phase9-staging-verification.md. |
| 2026-10-10 | Phase 9 MA production follow-up | Read verification passed; data review needed | User authorized MA production access and completed TMV-8B626F68AE. Verified completed status/requirement, one owned saved manual submission/unique index, duration/overtime arithmetic, matching GBP 180 system/manual collection, real day report and eight-sheet XLSX reopening/PDF signature. Flagged 1.5-minute system versus 344-minute manual duration and GBP 50 expected with unverified online prepayment; outstanding remains unknown. No pending manual, but two old active jobs remain. Write-path retry command rejected before execution and removed; no production mutations/integrations/push/deploy. See backend/docs/phase9-ma-production-verification.md. |
| 2026-10-10 | Driver Breakdown total-charge compatibility | Local correction | Renamed section and replaced search with exact-driver dropdown. User identified GBP 376.60 versus GBP 653.20 mismatch against previous Total Charges. MA-only production read identified two GBP 326.60 calculations, with one accepted amount adjusted to GBP 50. Added separate calculatedChargesPounds summary field; Total Charges screen/print use that original calculation, while existing adjusted totals, driver charged amounts, receipts and outstanding semantics remain unchanged. Added regression cases for calculation/adjustment/receipt separation, explicit zero and print rendering. No stored financial records repriced or changed; no push/deploy. |
| 2026-10-10 | Payments tab client revision | Implemented locally | Replaced four payment cards with Total Charges, Driver Collection (final driver-charged amount plus adjustment reasons), Manual Entries (manual-form collections only) and signed Outstanding = Driver Collection - Manual Entries. Added server full-range paymentCards summary before pagination; missing inputs remain unknown and no prepayments are added to this requested entry balance. Job-flow financial breakdown has a final Total including clearly labelled unpaid invoices. Removed Payments job reconciliation section; retained separate verified audit/comparison semantics. Full backend 496 tests/51 files and frontend 206 tests/47 files passed; both typechecks and independent 0/3/105-job export integrity checks passed. Desktop/mobile synthetic UI inspected. See backend/docs/driver-payment-cards.md. No production writes/push/deploy. |
| 2026-10-10 | Payment cards and date filters follow-up | Implemented locally | Renamed Driver Collections in Performance/Payments. Manual Entries now displays the valid available full-range subtotal with red amount and missing/invalid entry counts instead of hiding the subtotal; complete Outstanding remains unknown when entries are missing. Added separate known subtotal/missing count to the report projection and excluded inconsistent entries from that subtotal. Removed This Month/Last Month shared date presets, retaining custom dates and chart grouping. Focused backend 42 tests and frontend 20 tests passed. No production writes/push/deploy. |
| 2026-10-10 | Comparison client revision | Implemented locally | Updated System totals to Total Charges/Driver Collected/Working Time and Manual totals to Total Amount/Reported Time/Helper Hours. Added congestion/tunnel fee rows on both sides, removed lower balance strips and GPS-observed fee blocks, and hid the requested provenance warning without changing backend audits. Completed-job links open the Finished Jobs detail view with the job ID and retained dates; known unfinished jobs retain normal job navigation. 17 focused UI tests and typecheck passed. No production writes/push/deploy. |
| 2026-10-10 | Driver report selector | Implemented locally | Added a roster-backed dropdown above the driver report to switch drivers without returning to the summary. Retains dates/tab/grouping, resets pagination, clears old job references and retains export cancellation on driver changes. Handles inactive/current archived identities, loading and roster/report errors. Synthetic browser switching verified updated identity/data and mobile fit; 22 focused tests and frontend typecheck passed. No production writes/push/deploy. |
| 2026-10-10 | Remove driver-report liabilities tab | Implemented locally | Removed Penalties & Liabilities navigation, dedicated summary/evidence content and its UI pagination. Six report tabs remain; old liabilities links fall back to Performance and legacy page parameters clear on driver/filter changes. Stored records, backend APIs, exports and existing per-job evidence are unchanged. 21 focused UI tests and frontend typecheck passed. No production writes/push/deploy. |
| 2026-10-10 | Report driver filter placement | Implemented locally | Moved the roster dropdown into header actions immediately left of PDF instead of above the report. Switching/recovery behavior retained; responsive sizing keeps selector and export buttons aligned on mobile. 22 focused tests, frontend typecheck and mobile synthetic layout check passed. No production writes/push/deploy. |
| 2026-10-10 | Unified admin Liability page | Implemented locally | Consolidated four sidebar/command-palette scenario destinations into one Liability page with Check In, Check Out, Parking Liability and Liability Reports switches. Reused existing pages/actions and shared driver/search/date filters across views; switch resets pagination and old detail state. Legacy section links and browser history remain compatible. Mobile shows all four labels in two rows. 14 focused navigation/filter tests and full frontend regression (229 tests/50 files) passed; typecheck and synthetic desktop/mobile checks passed. See backend/docs/admin-liability-page.md. No production access/writes/push/deploy. |
| 2026-10-10 | Driver notification details | Implemented locally | Driver bells now open a portal-backed full-text notification modal, preserving message/title line breaks without truncation, with type/time/highlighting and explicit safe related-page navigation. Opens mark-read locally without leaving the job; admin bell and persistent/OS push behavior unchanged. Close/Escape/focus/scroll behavior verified; corrected shared backdrop dismissal while preserving non-dismissible forms. Full frontend 240 tests/52 files and build/typecheck passed; desktop/mobile synthetic content/scroll checks passed. See backend/docs/driver-notification-modal.md. No production data access, push delivery, push/deploy. |
| Pending | Phase 9 remaining release checks | Next handoff | Review backend/docs/phase9-verification.md and phase9-rollout.md. Actual P9.2 backfill needs explicitly approved isolated database/tracker/provider scope; real Mongo/index/crash behavior, physical portal/device/native download/font/load checks and frontend build-tool review remain unresolved. Do not mark the whole feature release-ready or perform push/deploy without user direction. |

### Job timing columns and alternating sections (2026-10-11)

- Removed the Completion status row from per-job Performance & Timings. Replaced Notes with right-hand Timing/Time columns for the five milestones; metric and payment descriptions remain alongside their values rather than in a Notes column. Payments now uses Detail/Value only.
- Expanded job sections alternate white and light blue: Customer & schedule, Performance & Timings, Payments, Financial breakdown, Tunnel Charges, Congestion Charges and comparison. Sections remain unframed bands, with compact road cards unchanged.
- 23 focused UI tests and TypeScript passed. Synthetic desktop/mobile screenshots and table/page-overflow checks passed. No source data changes, push or deployment.

### Complete per-job performance and compact road summaries (2026-10-11)

- Per-job Performance & Timings now includes the main-tab metrics in table form, including completed jobs, Total Charges, Driver Collected, working/moving hours, overtime, delays, reviews, helper hours and all five milestones. Arrival-to-proof gaps retain the 15-minute red tag.
- Replaced the two saved-fee cards above the tables with separate Tunnel Charges and Congestion Charges sections below financial details. Each has the same three GPS-linked metrics as its main tab, using complete embedded job records, with small cards in one row on desktop and mobile. Shared metric rendering avoids wording/calculation drift; missing history remains unavailable. Saved fees remain separate in Payments.
- 31 focused UI tests, TypeScript and production build passed; synthetic desktop/mobile screenshots and three-column/overflow checks verified. No backend financial calculation changes, live access, push or deployment.

### Default date filter (2026-10-11)

- Driver reports now default to Today in London time, matching the main Breakdown summary. Explicit URL/selected date ranges remain unchanged. 12 report-page tests passed.

### Chargeable-times cards (2026-10-11)

- Added a yellow Chargeable Times card to both road-charge tabs. Tunnel: Monday-Sunday, 6:00 AM-10:00 PM. Congestion: Monday-Friday, 7:00 AM-6:00 PM; Saturday-Sunday, 12:00 PM-6:00 PM. Explicit London-time label; existing charging calculations are unchanged.
- 8 road-table UI tests and frontend TypeScript passed. Synthetic browser verified displayed schedules, yellow styling and no page overflow. No push or deployment.

### Job-linked road activity and restored charge cards (2026-10-11)

- Road reports now exclude unlinked GPSLive alerts before totals/pagination/export projection, while leaving source GPS records untouched. Event/visit counts remain job-linked. Unique legacy time matching respects frozen report/billing driver identity instead of the current assignee; no guessed or ambiguous job allocation.
- Restored Tunnel Charges and Congestion Charges cards in Jobs selected-range totals and inside each expanded job. Cards use saved job fees, not additional GPS-estimate amounts, so existing financial totals are not charged twice. Known zero selections remain zero; saved legacy tariffs are reused and genuinely missing amounts remain unknown.
- Zone labels omit Charges/Alerts decoration; both tables use Zones and omit Exited. Zone clicks retain detailed alerts; valid job-ID links now open the job directly. Missing linked fees state whether the rate or work interval is unavailable.
- 58 focused backend and 40 frontend tests passed; backend build and frontend build checked. Synthetic browser confirmed restored cards, no reintroduced Jobs activity sections, updated zone columns and no unlinked rows. No live database/provider access, push or deployment.

### Breakdown loading optimization (2026-10-11)

- Added bounded, single-flight backend read caches (full report 30 seconds / 8 entries; summary 10 seconds / 12 entries), with invalidation after job, evidence, manual-summary, pricing, driver-account and dashboard writes. Invalidated pending reads cannot repopulate the cache; exports always build fresh.
- Reduced Moving Hours reads to GPS positions/drives only, keeping device limits/truncation labels. Replaced repeated job/event/visit scans with maps and indexed device ownership, preserving assignment/ambiguity rules; overlapped independent report reads.
- Frontend keeps recent filter/tab responses for 5 seconds, cancels superseded summary requests, and keeps date controls available while loading. Does not show old-range totals under new filters.
- Full backend 528 tests passed; focused frontend 38 tests passed. Full frontend had 285 passes plus one outdated removed-review-column assertion, corrected with its 2-test rerun passing. Both builds/typechecks and synthetic browser tab/date checks passed. See backend/docs/breakdown-performance.md. Cold-load live latency remains unmeasured; no speed percentage claimed. No live database/provider access, push or deployment.

### Breakdown summary moving hours (2026-10-11)

- Main Driver Breakdown table now shows Moving Hours instead of Working Hours. Opt-in summary reads use stored GPS positions/drives and the existing GPS movement/ownership rules, including historical devices and overlapping-job rejection. Reads each device once, only for Breakdown; other summary consumers and full-report working hours are unchanged.
- Completed-job moving seconds are converted to hours; missing GPS/read failures remain Unavailable and incomplete coverage is labelled partial. Working duration is never substituted for moving time. Synthetic aggregation/UI tests cover shared devices, missing/manual-finish movement, partial coverage, explicit stationary zero and provider failures. No production/provider access, push or deployment.

### Payments overtime summary (2026-10-11)

- Added an Overtime Charges card with recorded overtime hours to Payments. Backend sums saved overtime amounts for all completed jobs in the selected range, independent of UI pagination; no rate recalculation or duplicate additions to payment totals. Missing charges/durations are labelled incomplete rather than confirmed zero.
- Wide desktop shows all five payment cards in one row; smaller screens keep the responsive grid. 40 backend aggregation/service tests, 19 frontend report tests and frontend/backend TypeScript passed; synthetic card values/layout checked. No production/provider access, push or deployment.

### Separate job dates and milestone times (2026-10-11)

- Performance & Timings job table now has a separate Date column using each filtered job operational date in London time. Its five milestones show HH:mm only, without Captured/Recorded source labels. Individual Jobs timing details follow the same time-only display with a separate Date row. Stored evidence/provenance and billing remain unchanged.
- Synthetic table values verified; no production/provider access, push or deployment.

### Breakdown readability (2026-10-11)

- Kept the existing branded font family; increased report body/tab text to 16px, tables and comparison rows to 14px, supporting text to 13px, desktop key figures to 30px and mobile figures to 25px. Strengthened labels/table headings, enlarged charts and added row/card spacing. Summary table uses 16px text, stronger numeric figures and larger report action targets.
- Changes are scoped to Breakdown/report styles; billing, data, other dashboard screens and PDFs are unchanged. Enlarged mobile job tables and cards verified with no page/card overflow; wide timing/summary tables retain deliberate local scrolling.
- 35 focused frontend tests and TypeScript passed. Synthetic desktop/mobile visual checks passed. No production/provider access, push or deployment.

### Per-job payment and timing tables (2026-10-11)

- Expanded Jobs now includes tabular Performance & Timings, Payments and Financial breakdown: job status, scheduled/allocated/working/moving/overtime durations, delay, review/helper/manual hours, all five milestones, total charges, Driver Collected, adjustment reason, manual entry, outstanding with the agreed formula, base/extra/road fees and job-flow payment methods with a total.
- Removed tunnel/congestion activity sections from Jobs only; dedicated road-charge tabs and financial fee rows remain. Job-flow method totals remain separate from manual receipts, absent milestones stay Not recorded and absent manual balances stay Unknown. No billing/backend data changes or graphs added to Jobs.
- 29 focused frontend tests and TypeScript passed. Synthetic desktop/mobile tables verified without page overflow. No production/provider access, push or deployment.

### Date-filtered performance charts (2026-10-11)

- Replaced the metric-switching area graph with three separate daily bar charts: Completed Jobs, Driver Collected and Working Hours, each with its own units and formatted date/value tooltips. Removed chart grouping, metric selection and the Trend values expander.
- Main driver/date filters alone control the graphs. Requests use daily data even when an old link contains weekly/monthly grouping. Full-range aggregates remain independent of job pagination; Driver Collected uses accepted driver amounts rather than billed revenue or manual receipts. Unknown collection amounts are not plotted as zero, and incomplete working hours are labelled.
- 28 focused frontend tests and TypeScript passed. Synthetic desktop/mobile layouts, rendered bars, no mobile page overflow and main-filter updates verified. No production/provider access, push or deployment.

### Performance and milestone timings (2026-10-11)

- Renamed the visible tab to Performance & Timings, keeping its stable performance URL key. Added the paginated per-job timing table directly below cards: Tracker Arrival, Proof Photo, Van Loaded, Empty Van and Customer Signed, with job/customer identity and existing job navigation.
- Backend batches evidence reads for selected jobs. Photo capture timestamps are preferred, with explicit Captured/Recorded labels; GPS/signature fields remain distinct, missing/invalid timestamps stay Not recorded, and manual/admin finish is not presented as an empty-van photo. Existing billing boundaries/calculations are unchanged.
- PDF section naming and its timing table follow the updated tab. 26 frontend and 49 backend/report/export tests passed; frontend/backend builds and TypeScript passed. Synthetic desktop table placement and values checked. No production/provider access, push or deployment.

### Breakdown summary columns (2026-10-11)

- Summary rows now show Jobs, Total Charges, Driver Collected, Working Hours and Overtime Hours alongside driver identity/report actions. Removed receipt, invoice and review columns from this summary only; full report details are unchanged.
- Driver Collected uses the existing final driver-charged revenue aggregate, not payment-method receipts. Overtime minutes are displayed as hours. Existing completed-job count and date filters are preserved.
- 6 focused summary/filter tests and frontend TypeScript passed. No push or deployment.

### Breakdown roster alignment (2026-10-11)

- Driver Breakdown now applies the same account-backed roster filter as the Drivers tab, excluding job-only historical initials and UNASSIGNED from the table, count and dropdown. Inactive accounts remain included because they also appear in Drivers.
- A selected driver is cleared when their account no longer belongs to that roster. Historical jobs and backend audit/report records are unchanged.
- 6 focused filter tests and frontend TypeScript passed. No database/provider access, push or deployment.

### Dropdown job indicators (2026-10-11)

- Replaced plus/minus indicators with stable Lucide dropdown chevrons in Jobs and Comparison. Chevrons rotate upward when expanded; native details/summary interaction is unchanged and reduced-motion preference is respected.
- Focused report tests and frontend TypeScript passed. No push or deployment.

### Remove Driver Breakdown Excel button (2026-10-11)

- Removed the Excel download button from the driver report header, retaining the driver selector and PDF on one compact responsive row. Backend Excel support is unchanged; this is a UI-only revision.
- 9 driver-report navigation/control tests and frontend TypeScript passed. No push or deployment.

### Driver Breakdown PDF cleanup (2026-10-11)

- Replaced exhaustive PDF output with six tab-aligned, table-only sections: Performance, Payments, Jobs, Comparison, Tunnel Charges and Congestion Charges. Important selected-range totals/job data retained; removed graphs, raw audit/JSON details and the removed liabilities tab content. Excel output remains unchanged.
- Complete filtered jobs and GPSLive alerts remain in scope, not only the visible page. Saved versus calculated road fees are separate; missing values remain explicit. Compact A4 landscape tables repeat headings and continue oversized fields without truncation; an empty report is one page.
- Build and 15 backend export/PDF tests passed; synthetic samples rendered and inspected (including all 105 job IDs and a long customer-field tail). See backend/docs/driver-pdf-cleanup.md.
- Approval availability restored: the previously pending frontend report, preview, sidebar and return-navigation checks were rerun and passed (49 tests/7 files). No production/provider data access, push or deployment. Real selected-driver PDF review and remaining Phase 9 acceptance checks are still pending.

### Preview page furniture cleanup (2026-10-11)

- Removed job/reference text from the report header and eliminated repeated continuation headers. Kept the full reference/job identity in the first-page record metadata and footer page numbering.
- Removed Europe/London from page footers in shared preview/print templates and the server summary PDF. Timestamp timezone context in record details remains intact. No data/calculation changes.
- Frontend/backend TypeScript and whitespace checks passed. Updated regression assertions; automated test rerun remains pending under the previously reported approval-review limit, and the browser preview check could not attach. No push or deployment.

### Report header and chart grouping (2026-10-11)

- Driver selector/PDF/Excel stay on one non-wrapping responsive row with consistent 44px controls. Removed the report header refresh button without changing error recovery or fetching behavior.
- Renamed Trend period to Chart grouping and show it only on Performance. Daily/weekly/monthly grouping changes chart buckets, not selected dates or job totals.
- Drivers sidebar parent highlighting remains intentional for its detailed driver-report child route; no separate sidebar destination was requested.
- Mobile synthetic checks confirmed aligned controls within 390px viewport, refresh absence, grouping hidden on Jobs and weekly grouping without date changes. Frontend TypeScript passed; updated regression assertion added, but automated rerun remains pending due to the previously reported approval-review usage limit. No data/provider access, push or deployment.

### Per-job report completion (2026-10-11)

- Jobs tab now includes full-filter Total Jobs, Total Charges, Driver Collected, Manual Entries, Working/Moving Time, Overtime and review totals above expandable job records. Summary totals are independent of the displayed jobs page.
- Job records are grouped into customer/schedule, performance/time, financial breakdown, congestion activity and tunnel activity. Contacts, scheduled/actual timestamps, helper/moving hours, job-flow/manual methods and saved fee values are retained or exposed clearly; detailed System/Manual comparison remains expandable.
- Backend embeds each job's matching full returned alert list before API pagination. Per-job counts, chargeable records, timestamps, durations, fee totals and full alert dialogs use that list, not a paginated range slice. Saved job fees remain separate from alert-calculated charges, with no duplicate addition to stored financial totals. Missing embedded history remains unavailable, not a guessed zero.
- Initial verification: 18 focused frontend and 12 backend tests passed, frontend build and backend TypeScript passed. Final frontend TypeScript and desktop/mobile (390px) visual checks passed after adding range totals; the final test rerun was not executed because the approval reviewer hit its usage limit. A final automated rerun remains pending. No production data/provider access, push or deployment.

### Seven-day congestion display correction (2026-10-11)

- User reported Today activity disappearing under 7 Days. Confirmed the date preset already includes the complete London Today interval and previous six days; the problem was display grouping, not dates, pagination or a saturated provider query.
- Read-only WD reproduction: Today's three source records formed one visible entry. The weekly response still contained those same records, but an older unlinked Congestion Zone NE entry with no exit kept the display visit open across days/sectors; its unlinked first entry swallowed later linked activity and the weekly tab showed zero entries.
- Updated only the read-only road-alert projection: start a separate display row when the associated job or London day changes, preserve overlapping-sector grouping within the same job/day, preserve same-time duplicate suppression, and scope each row's zone names/source details to that row. Physical GPS reconstruction, saved billing totals, notifications and provider records are unchanged.
- Read-only verification after the fix: WD Today has one linked entry; 7 Days (5-11 October inclusive) has two linked entries including the same Today entry with the same fee. No unlinked rows were introduced and no source data was written.
- Verification: 87 focused backend tests, five date-filter tests and backend build passed. Regression cases compare actual differently sized query windows, missing exits across different days/jobs, duplicate IDs/times, overlapping sectors, weekly inclusion of Today and per-job charging. No push or deployment.
- User checkpoint: refresh the local WD congestion tab with 7 Days; Today's entry should remain present alongside the earlier job's activity.

### Breakdown performance and progressive loading (2026-10-11)

- User requested careful speed improvements and basic data before graphs/background details. Current Breakdown has no liabilities tab, so its display endpoint now omits liability reads; complete fresh PDF/Excel service reports retain the full evidence dataset. Omitted liabilities carry an explicit metadata flag and unknown complete total.
- Added validated core/full display requests and separate cache entries. Core returns financial/job/timing/manual data without GPS, provider or road-allocation reads. Basic content and filters render first; background movement/road details have loading states and an independent retry. The graphs load as a separate chart component chunk. New driver/range queries do not show prior-range totals.
- Parallelized independent context, settings, evidence and GPS collection reads. Report GPS payloads exclude unnecessary position fields and repeated run geometry/intervals, while retaining all uncertainty/limit checks and one newest usable snapshot within the existing 100-run window. Monitoring callers still receive full run metadata.
- Scoped provider alert reads to recorded historical trackers where possible; upcoming unstarted jobs do not force a full-fleet fetch. Legacy unpinned started jobs keep their historical driver/time fallback. Job-linked filtering, fee rules, saved financial values, provider completeness labels, auth and full export contents are preserved.
- Read-only WD timing sample: earlier full read 11.845s; new core data 2.520s, then background details 6.084s. Cached function repeats rounded to 0ms. This is a local service measurement including database connection overhead, not a guaranteed browser SLA or controlled frozen-data benchmark; the live job cohort changed from one to two jobs. Core/full financial summaries were identical in the new sample. No database/provider writes, import, push or deployment were performed.
- Verification: full backend suite passed 547 tests across 62 files; 45 focused frontend report tests passed; backend/web type checks and builds passed. Tests cover independent reads, payload/coverage limits, display versus full-export cache isolation, skipping unused liabilities, core-data availability before GPS, background failure/retry, tab/range/driver handling, deferred chart rendering and exclusion of unlinked activity.
- User acceptance checkpoint: refresh WD's local Breakdown; verify basic data appears first, graphs load independently, pending road/movement sections show a loader rather than zero, and switching tabs keeps navigation available. Real-device and release gates remain separate and unapproved.

### Job-linked tunnel/congestion scope (2026-10-11)

- User confirmed that only activity belonging to jobs is relevant for every count, customer charge, total, chart, comparison, tunnel/congestion tab, detail dialog and export. Unlinked/ambiguous source activity stays excluded until it has a real job association; internal recovery data does not enter driver reports.
- Confirmed the existing report service filters job-linked events, visits and road alerts before returning report data; API alert totals/pagination and dedicated road tabs retain that scope. No source GPS records or financial calculations were changed by this clarification.
- Updated requirements, report contract and unmatched-event fixture to remove older wording suggesting visible unlinked verification rows. Added a regression with both off-job congestion and tunnel entry/exit records: returned events/visits/charges, alert lists, GPS counts, financial/trend totals, job details and road export sections stay identical to the job-linked baseline.
- Verification: 20 focused backend tests passed across driver-report-service and driver-road-alerts suites. No database/provider access, push or deployment.

### Tunnel label policy follow-up (2026-10-11)

- User accepts GPSLive tunnel Zone In alerts as the operational source. Removed estimate wording from the tunnel view: Total Tunnel Charges, Tunnel Fee and Current Pricing Settings. Saved-rate provenance remains visible; unpriced/unlinked records remain Not calculated rather than fabricated zero amounts.
- Counts, schedules, rate selection, API field names, ledger verification and stored financial values are unchanged. Congestion wording is unchanged. This is a display-label revision, not independent certification of GPS boundaries or historical tariff accuracy. No database/provider access, push or deployment.
- Verification: 16 focused report tests passed, final tunnel-label tests passed, frontend build with TypeScript checks passed, and diff whitespace checks passed.

### Return from job to Driver Breakdown (2026-10-10)

- Implemented locally: report job links retain a validated same-app return URL with the originating driver, dates, report tab, grouping and pagination. Back to Driver Breakdown appears in the job/detail/PDF preview header and on the underlying jobs page, including after a reload or closing the preview.
- Return replaces the job route rather than adding another job/report history loop. Ordinary job links remain unchanged; unrelated sidebar navigation clears the return context, and external/unrelated destinations are rejected.
- 18 focused navigation/preview tests, TypeScript and build passed. Synthetic desktop and 390px mobile checks verified visible header control and correct return to the selected Comparison report. No database/provider access, push or deployment.

### Collapsed sidebar polish (2026-10-10)

- Implemented locally: 80px icon rail, centred 20px icons with 44px targets, higher-contrast inactive icons, clear active background/blue marker, distinct Jobs/Liability icons and a fully visible 36px expand control. Added accessible names/current-state attributes and parent highlighting for finished jobs/driver reports/legacy liability routes.
- Synthetic browser checks verified icon bounds, active selection, expand/collapse, no unnecessary rail scrolling at desktop height and readable 260px mobile drawer after desktop collapse. Focused sidebar/admin navigation tests, TypeScript and frontend build passed. No data access, push or deployment.

### Formal report design follow-up (2026-10-10)

- Implemented locally: shared company header, full references, labelled record metadata, neutral evidence/signature/notice styling and consistent footers for finished jobs, legacy job reports and all scenario previews/print sources. Fixed report headers hidden by generic print CSS and removed hard overflow clipping.
- Replaced the legacy server summary PDF writer with PDFKit wrapping/pagination and awaited download generation; removed unsupported immutable-record wording. Summary data remains separate from the full photo dossier.
- Full regressions passed (508 backend, 250 frontend), plus focused final preview/print consistency checks. Generated synthetic summary PDF rendered and visually reviewed; see backend/docs/formal-report-design.md.
- No production data access, push or deployment. Next acceptance step: client checks real photo-heavy browser PDF downloads and unusually long records; professional styling is not legal certification. Phase 9 release checks remain open.

### Road-alert report follow-up (2026-10-10)

- Implemented locally: report reads GPSLive alert history alongside stored GPS records, displays distinct zone-entry alerts and job IDs, and estimates fees using supplied schedules and saved/settings rates. Congestion remains once per job; tunnel alert passages are estimates, not physical crossing proof. Stored job totals and strict charge ledger are unchanged.
- Removed warning-heavy tunnel/congestion content. Zone/job links open full entry/exit alert details with a separate Open Job command. Scheme filtering and full-range totals precede pagination.
- See backend/docs/driver-road-alerts.md for matching, deduplication, provider limits and synthetic verification. No production data/GPS changes, push or deployment. Next unchecked release work remains Phase 9 and client review of actual driver/date alert results.

### Report preview polish follow-up (2026-10-10)

- Implemented locally: shared first-page title, removed repeated MAN VAN branding, cleaner metadata/media layout, responsive wrapping, correctly sized zoom canvas and docked preview controls. Finished-job and all four scenario renderers retain source information and calculations.
- Synthetic desktop/mobile browser checks, full frontend regression (249 tests/55 files) and build with TypeScript checks passed. See backend/docs/report-preview-polish.md. Native PDF printing/download pagination remains an acceptance check; no production data access, push or deployment.
- Next unchecked release work remains the Phase 9 remaining release checks above.

### Checkpoint 5 implementation notes

- New completed assigned jobs open Manual details on the workflow screen. Reload/relogin job lists return pending completed jobs for the same driver; direct Start/On-my-way calls return MANUAL_DETAILS_PENDING until the unique summary exists. Active jobs cannot be bypassed by starting another ready job. Completion/start checks serialize through the existing single-process job/driver mutexes.
- Form start defaults to Calendar booking, end to the recorded finish, with editable London-local inputs converted to explicit UTC instants. Existing offset is retained when an original timestamp is unchanged. Helper is optional; positive helper hours require a name. No driver liability/parking amount intake was added.
- New payment methods are Cash, Card, Link, Bank Transfer and Invoice. Invoice amounts remain uncollected. No payment received is an explicit alternative to selected methods. Prefill uses recorded payment breakdowns; a paid-online flag or final customer price alone never becomes a guessed collection. Historical combined Invoice/Transfer remains unchanged; new ambiguous combined-method submissions require separate selections.
- Manual charge items contain type, optional name/reference and nullable amount. Blank amounts mean Unknown, not a proven zero. Congestion is reported once per job; multiple tunnel rows are allowed. These fees are components within payment totals. GPS references and expected-rule verification remain Phase 3/4 work.
- Server validation caps each monetary amount and summed collections at GBP 1,000,000, two decimal places; job/manual and helper durations at 168 hours; charge rows at 30; helper/charge names and references at 160 characters. These are technical input bounds, not charging rules. Explicit zero amounts are valid.
- Drafts are versioned and keyed by driver/job, retained until confirmed submission with no weekly expiry. Failed saves and session interruptions keep the draft; confirmed server records restore a locked view. If local storage is unavailable, the form warns that reload recovery is unavailable. Completion gating is enforced by the backend, independently of draft storage.
- The existing unique jobId index remains the final duplicate guard. Identical normalized retries return the original saved record; changed submissions return a locked conflict. No admin update route was added. Activity-log failure after a successful insert does not falsely report a failed save.
- Final concurrency review corrected the shared mutex cleanup: an earlier request must not remove the queue key while later requests still own it, and a timed-out waiter must not release its active predecessor. Added overlapping-request, timeout and failed-holder tests. Final full backend run passed 262 tests across 27 files after this fix; final production web build passed after completing the new screen-test fixture's required fields.
- Model guidance remains the Phase 2 row above. Runtime risk is medium-to-high because this changes driver queue access and financial intake. Local automated checks passed; client visual/device review and eventual test-environment integration remain required before release.

### Checkpoint 4 implementation notes

- New automatic totals require recorded arrival and Empty Van finish boundaries. Payment/review/manual-form time never increases overtime. Missing/invalid boundaries are flagged for verification; fallback completion timestamps are labelled explicitly and never used to create automatic overtime charges.
- Final working-hours guard: normalization excludes admin/manual fallback completion durations from measured driver-hour totals. The normalization/driver-summary follow-up suite passed 12 tests; this prevents a late administrative completion from being counted as days of work.
- Calendar rates normalize hourly/half-hour/decimal/comma-separated formats. Ambiguous Calendar text uses the accepted settings fallback while retaining a verification flag. Invalid explicit settings are unknown; automatic payment totals are blocked when overtime has no valid rate. Half-penny hourly conversions round to the nearest penny.
- Billing rate and durations freeze at the first accepted billing step, before payment. Base/congestion/tunnel selections freeze at total confirmation. Retrying totals, reloading, changing settings or completing later preserves the snapshot. Intentionally changing extra-charge selections before completion permits those selected fees to be confirmed again; it does not change the frozen time/rate calculation.
- Original Calendar rate text and packing classification freeze after arrival for new jobs. The driver's entered overtime and crew remain independent comparison data; system fallback uses booked crew/service pricing.
- Existing completed jobs and older jobs already at payment/review retain accepted prices without retrospective recalculation. Saved historical totals are used by reports. Detailed historical charge-rate reconstruction without an existing snapshot remains part of later charge/history work.
- Workflow actions, photos, signatures, admin finish and Calendar writes share the existing per-job mutex. This preserves the repository's single-process locking assumptions; distributed/multi-instance coordination is not claimed.
- Risk: medium-to-high because runtime financial behavior changes. All local automated checks passed; visual/device verification and a real test-environment job remain client/integration handoff checks. No release authorization was given.

### Checkpoint 1 details

- Calculator uses supplied Calendar and actual timestamps with explicit offsets; rejects invalid/non-positive bookings and reversed actual times. It never substitutes the current clock for missing finish data.
- Snapshot preserves exact scheduled duration, rounded allocation, actual/extra minutes, billed half-hour blocks, integer-pence rate/charge, rate source, original instants normalized to UTC, and rule version.
- Millisecond precision is retained through allocation/block comparisons; overnight and London daylight-saving cases are covered.
- Missing rate produces an unknown extra charge when overtime exists. No excess still yields zero extra charge. Explicit zero rates remain supported.
- Rate and partial-block policy must be supplied explicitly. The provisional round-up policy is tested but is not connected to live jobs/payments.
- Snapshot is immutable and serializable; persistence, rate parsing, workflow activation, and admin duration fields are future steps.
- Risk for this isolated step: low operational risk because it has no runtime consumers. Financial integration in the next steps remains higher risk.
- Minimum recommended model for this focused calculator/test step: GPT-6 Luna with High reasoning, when available. For cross-module billing activation/GPS work, prefer GPT-6.1 Sol at the available default reasoning setting. Guidance checked 2026-10-09: https://learn.chatgpt.com/docs/models . Model suitability for this particular step is an engineering judgment; availability depends on account/client.
- Review examples at GBP 55 per half hour: 90 actual minutes -> GBP 0; 120 -> GBP 0; 150 -> GBP 55; 180 -> GBP 110. Proposed partial blocks: 121 -> GBP 55; 151 -> GBP 110.

On every future implementation handoff, add a row here and state the next unchecked step. Do not mark the entire feature complete while any required acceptance check or external capability remains unresolved.

### Finished-only Breakdown checkpoint (2026-10-11)

- Configurations grouping and sidebar order (2026-10-11): combined the unchanged Pricing Settings and Messaging Content pages under Configurations with top-right switches, default Pricing selection, responsive labels and legacy pricing/settings/messaging URL compatibility. Only the active page loads; existing edit/save/reset handlers and API Settings modal are unchanged. Reordered sidebar to Overview, Jobs, Liability, Drivers, Van, Notifications & Alerts, Live Fleet, Configurations. Verification: configuration/communication/navigation tests, latest sidebar-order regression, frontend TypeScript check and Configurations production build passed. No pricing/template changes, push or deployment. User checkpoint: review expanded/collapsed menu order and open Configurations to confirm Pricing first and Messaging switching/old links.

- Notifications & Alerts grouping (2026-10-11): renamed the sidebar destination, removed separate Alerts navigation, and added a top-right Notifications/Alerts switch around the unchanged existing pages. Notifications is the default on normal sidebar entry; explicit alerts links and browser history remain supported. Only the selected view mounts/loads, preserving existing page behavior and avoiding simultaneous queries. Existing push, broadcast, filtering, dismissal and API handlers are unchanged. Verification: navigation/sidebar regression suites passed, including the final 13-test routing/default-view run; frontend TypeScript check and production build passed. Local only, no push/deployment. User checkpoint: open Notifications & Alerts, verify Notifications selected first, then switch to Alerts and confirm its original controls/data are present.

- Live Fleet map simplification (2026-10-11): retained only OpenStreetMap in the provider dropdown and removed Voyager/Positron URLs, theme state and the redundant tile-layer rebuild. Map initialization still uses the same OpenStreetMap tiles; vehicle tracking, filtering, congestion overlays, zoom and other map controls are unchanged. Verification: provider/layer regression test and frontend TypeScript check passed. Local only, no push/deployment. User checkpoint: open Live Fleet and confirm the provider dropdown contains only OpenStreetMap and normal map interactions remain available.

- Liability UI correction and tracker-reason display (2026-10-11): moved Parking Liability filters out of the table frame to a standalone bar above it; moved all four Liability view switches into the secondary controls row and aligned refresh/export positions with Jobs. Matched switch padding/corners/selection styling and search-field styles to Jobs, including the standard Alerts/Notifications/Van search fields. Shared driver/search/date state, tab keyboard focus and existing callbacks remain intact. Performance & Timings now displays a missing tracker-arrival reason in red beneath the timing; expanded report job details display it too. Added report timing metadata using the same reason helper as Jobs normalization; no new financial/time calculation. Verification: 34 focused backend tests, 39 focused frontend tests and both TypeScript checks passed; Liability/search production build passed before the final reason-display addition. No push/deployment. User checkpoint: compare Liability against Jobs on localhost:3001; with the updated backend, confirm an unverified tracker time shows the same red explanation in Performance & Timings and Jobs.

- Pickup arrival radius/distance (2026-10-11): changed GPSLive pickup verification from 300m to an inclusive 500m across polling and proof upload. Two distinct fresh stationary reports and existing tracker/time/ownership guards remain. Added frozen candidate/confirmed arrival distances, separate from latest trackerDistanceMeters, retained/reset with Calendar changes. Admin detail/report/paper/PDF and email tracker-arrival times now include bracketed recorded metres; old missing distances remain explicitly unrecorded and no historical arrival is invented. Verification: full backend 561 tests / 62 files and focused frontend 48 tests / 5 files passed, plus both TypeScript checks. No production data writes, push or deployment. User checkpoint: on the updated backend, confirm a new 405-500m pickup is accepted after two qualifying reports and its timestamp shows the first report's distance even after the van moves.

- Historical job-detail crash fix (2026-10-11): read-only inspection found Aragao/AR job TMV-0003AE4E32 has null optional driverReportedOvertimeMinutes. JobTimeBreakdown tested only undefined before calling toFixed, crashing Jobs/Finished job details and the shared PDF renderer. Reproduced the null.toFixed failure in both time-breakdown and full detail/preview regression tests, then excluded absent reported-overtime rows and added finite/non-negative duration formatting with Not recorded for invalid values. Explicit zero and saved financial/working values remain unchanged; no database edits. Verification: 21 time/detail/preview/card tests across five files and frontend TypeScript check passed; localhost:3001 serves both guards. Local only, no push/deployment. User checkpoint: refresh the browser once to reset the error boundary, then reopen Aragao's job and its PDF preview.

- Manual Entries warning styling (2026-10-11): Jobs and Payments summary cards retain their neutral border and amount colour when manual entries are missing/invalid. Only the missing/invalid-entry count text uses the same red warning style as congestion/tunnel unavailable counts. Calculations, available subtotals and outstanding values are unchanged. Verification: 26 report UI tests and frontend TypeScript check passed. Local only, no push/deployment. User checkpoint: a Manual Entries card with 1 missing entry should show the available amount normally and only the warning beneath it in red.

- Driver report navigation defaults (2026-10-11): normal links from Breakdown/Drivers and report URLs with no valid reportTab now open Jobs by default. Explicit Comparison, Performance and charge-tab links are preserved. The main sidebar highlights Overview while the detailed Driver Report is open, rather than Drivers; its existing collapse/expand behavior and report header remain unchanged. Verification: 44 navigation/sidebar/summary tests across five files and frontend TypeScript check passed. Local only, no push/deployment. User checkpoint: open a driver normally to verify Jobs selection and Overview sidebar highlight, then open Compare to verify the explicit Comparison destination.

- Partial road-charge totals correction (2026-10-11): report summary cards now show the sum of available saved congestion/tunnel amounts whenever at least one completed job has an amount. Unavailable-job counts remain red below the amount; the known value is not coloured as an error. Explicit saved zero is valid; Unknown is reserved for an all-missing completed-job cohort. Missing job amounts are not filled, current tariffs are not substituted, and GPS estimates are not mixed into recorded totals. Core and full reports use the same calculation. Verification: 57 focused backend/report/export tests, 25 report UI tests and both TypeScript checks passed. Local only; no push/deployment. User checkpoint: MA Yesterday should show the known GBP 18 congestion / GBP 13.60 tunnel amounts with 1 unavailable job charge beneath each once the updated backend is in use.

- Driver-card styling correction (2026-10-11): the earlier rectangular-card change covered Jobs/Finished Jobs but missed the separate Drivers roster cards. Drivers cards and their loading/empty states now use the same 6px corner style and light borders, without floating hover shadows/lift. Padding, fields, edit/deactivate/delete handlers, filtering and report navigation are unchanged. Verification: 11 driver/job/summary UI tests and frontend TypeScript check passed. Local only, no push/deployment. User checkpoint: refresh localhost:3001/admin?section=drivers and review the corrected outer card shape.

- Local MA notification follow-up (2026-10-11): user confirmed localhost:3001. Added a development-only notification-test.html page that verifies the current session is MA and inserts short/long labelled samples into that exact browser origin's bell history when requested. Existing history is preserved, duplicate samples are skipped, and persistent banners are suppressed for these bell-only examples. No further pushes or backend writes. Verification: page served on localhost:3001, 12 local-sample/bell tests and frontend TypeScript check passed. User action: open http://localhost:3001/notification-test.html while signed in as MA, click Add test notifications, then Open driver app and inspect both messages through the bell. Local only, no push/deployment.

- MA notification test (2026-10-11): user authorized short/long dummy notifications for MA. Two clearly labelled TEST ONLY office-message pushes (179 / 1,315 body characters) were accepted by all seven MA non-admin endpoints. Other drivers were not targeted. No backend database writes, subscription pruning, VAPID generation, job mutation, code push or deployment. Next user check: on the updated frontend, open each from the bell and verify the short preview expands to full content, the long message scrolls to LONG TEST END, and closing leaves the current job unchanged. Provider acceptance is not confirmed receipt/display.

- Liability/default-filter follow-up (2026-10-11): Parking Liability is now the default unified Liability view when no valid tab is supplied. Explicit current/legacy links and history restoration are preserved. Shared AdminFilterBar places dates/counts on row one and existing controls/actions on row two, following Jobs; adopted by Jobs, Finished Jobs, all four Liability views, Alerts, Notifications, Van, Drivers and Overview. Filter handlers, dates, query parameters, callbacks and data calculations are unchanged. Full frontend regression: 323 tests across 65 files passed; latest Liability/Finished tests, frontend typecheck and production build passed. No push/deployment. User checkpoint: open Liability without liabilityTab, switch all four views while retaining filters, and compare filter placement against Jobs on desktop/mobile.

- Admin job-card UI consistency (2026-10-11): Jobs and Finished Jobs cards now use compact 6px corners and consistent light borders; their loading placeholders follow the same shape. Expandable report job/comparison rows use matching rectangular framing, padding and a subtle hover treatment. Card grids, fields, controls, selection, menus, pagination, detail navigation, expand/collapse behavior and backend calculations are unchanged. Verification: 26 job-card/finished-job/report UI tests and frontend TypeScript check passed. Local preview: http://127.0.0.1:5173/admin?section=jobs . No push/deployment. User checkpoint: check Jobs cards, Finished cards and expanded report rows at desktop/mobile sizes before the next step.

- Sidebar navigation refinement (2026-10-11): leaving Driver Report for any other admin section now expands the sidebar, not just Overview/Drivers. Tabs inside the same report retain the user's current sidebar state. Existing mobile drawer and manual choices on unrelated section changes remain intact. Verification: 19 sidebar tests across two files and frontend TypeScript check passed. Local only, no push/deployment. Rectangular admin job-card styling remains a design discussion; no broad card restyling was applied.

- Sidebar focus follow-up (2026-10-11): entering Driver Report automatically collapses the desktop sidebar, including report deep links; returning from Driver Report to Overview's Breakdown table or Drivers expands it. Existing width transitions and manual toggling are retained; report tab/driver changes do not override a manual sidebar choice. On mobile, report entry closes the drawer and keeps normal menu behavior. Other section changes do not reset manual collapse state. Verification: 26 sidebar/report navigation tests across three files and frontend TypeScript check passed. Local only; no push/deployment. User checkpoint: open a driver from Breakdown, then use Back to driver summary or browser Back and confirm the sidebar collapses/expands as expected.

- Payment method display follow-up (2026-10-11): removed the Unknown row from Payments and individual-job Financial breakdown tables. Zero unclassified amounts produce no warning; positive amounts remain visible separately as Unclassified payment requiring verification. Stored ledgers, totals, collection verification and export data are unchanged. Verification: 24 DriverReportView tests and frontend TypeScript check passed. Local only; no push or deployment. User checkpoint: WD Yesterday no longer shows the empty Unknown method row.

- Working Hours follow-up (2026-10-11): added the saved totalDurationMinutes to the front table alongside RW Sent / Not Sent and Overtime Hours. No new request, GPS read or provider call is required. The summary includes workingUnknownJobs for missing/invalid completed-job durations; the table shows the known subtotal with a red unavailable count, or Unavailable when every duration is missing. Explicit recorded zero durations are not classified as missing. Focused checks: 12 backend and 11 table UI tests passed. Changes remain local, not pushed or deployed. User checkpoint: confirm Working Hours and RW counts for the selected range, including a range with missing timings.

- Latest summary-table change (2026-10-11): replaced Moving Hours with RW Sent / Not Sent at the user's request. The front table now uses one completed-only core-summary request with includeMoving disabled and makes no background GPS request. Sent counts are green; positive not-sent counts are red. Detailed driver reports retain moving-hours calculations. Core summary reads are shared across optional movement requests using an invalidated, bounded 30-second cache, avoiding repeated financial normalization. Verification: 18 focused backend tests, 10 table UI tests and both TypeScript checks passed. These follow-up changes are local; the previous main push did not include them. User checkpoint: open Breakdown and check that rows/review counts load without waiting for Moving Hours; verify a different date range and empty finished-job range.

- Follow-up: Jobs is the first report tab. Both Moving Hours summaries retain known durations when other jobs have no GPS coverage, with the unavailable count in red; Jobs now also displays Loading while background movement is pending. Read-only WD Yesterday inspection (2026-10-10): three finished jobs, GBP 510 Cash, GBP 176 Card, GBP 0 Unknown. Unknown is an unclassified payment-method bucket, not an outstanding balance. User authorized pushing to main on 2026-10-11, explicitly without deployment.
- Pre-push verification: 47 focused report UI tests passed, followed by all 304 frontend tests across 61 files; frontend and backend production builds passed. The prior complete backend suite passed 552 tests across 62 files. Commit scope is application source, tests, verification scripts and documentation; local .env files, attachments and generated PDFs/renders are excluded. Pushing does not authorize deployment, history imports or production data changes.

- [x] Restrict detailed report jobs, comparison data, financial/performance totals and trends to COMPLETED jobs before database row limits.
- [x] Exclude unfinished job-linked GPS events, visits, road alerts and charge calculations. Retain unfinished contexts internally only to avoid incorrect GPS associations. Existing occurrence-date filtering for completed contextual jobs remains unchanged.
- [x] Request completed-only summary data for Breakdown, with a separate cache key; operational Drivers/Jobs/Alerts behavior is unchanged. Hide summary rows with no completed jobs while retaining driver/date selectors.
- [x] Show "No finished job data" on every report tab for an empty completed-job cohort. Skip background GPS, road history and charts in this case; do not show stale cached full-report data over a new empty core response.
- [x] Add mixed-status, GPS exclusion, summary cache-isolation, database status scope, all-tab empty-state and empty-report request tests. Full backend suite: 552 tests / 62 files passed. Focused UI coverage: 45 tests / 3 files passed (including the final empty-request test). Backend and frontend type checks passed.
- [ ] User checkpoint: select a range with only ready/in-progress jobs and confirm the empty message. Select a range with completed and unfinished jobs and verify that only completed records and their linked charges appear. Completing a job should make it eligible after refresh; do not change live job statuses just to test.
- Next step: user review of this checkpoint, then the remaining unchecked release/device acceptance gates. No push or deployment authorized.

### Report card labels and comparable manual fields (2026-10-11)
- [x] Add (Expected) beneath Total Charges and (reported) beneath Manual Entries. Place Manual Entries immediately after Driver Collected in Jobs and Payments; retain red missing-entry warnings and existing calculations.
- [x] Remove Scheduled, Allocated, Overtime and Total Charges from job comparisons; remove Total Charges from range comparison totals and the PDF Comparison section. Keep these system-only figures in their regular performance/payment sections. Align range helper hours with an explicit Not recorded system value.
- [x] Verify 29 focused report UI tests, two PDF model tests, frontend typecheck and scoped whitespace checks. No push, deployment or production changes.
- [ ] User checkpoint: check Jobs/Payments card order and captions, then Comparison and its PDF section. Confirm that only manually captured fields appear in the comparison.

### Reported tunnel and congestion cards (2026-10-11)
- [x] Add Manual Entry with (reported) beneath its amount in Tunnel Charges and Congestion Charges, including the two per-job road-charge sections. Keep these amounts separate from GPS estimates and do not add them again to collections.
- [x] Aggregate saved manual charge items across every completed job in the filtered range before pagination. Sum multiple tunnel items, preserve explicitly reported zero, support legacy congestion declarations and distinguish missing submissions from unavailable/invalid historical amounts. Show known subtotals with red missing/unavailable counts.
- [x] Keep per-job cards responsive: four columns on desktop, two on small screens. Verify 52 focused backend tests, 43 report UI tests, both TypeScript checks and scoped whitespace checks.
- [ ] User checkpoint: compare tab-level reported totals with individual finished-job entries, including a job with multiple tunnel items and a job missing Manual Details. No push or deployment authorized.
- [x] Caption placement follow-up: (Expected) and (reported) now sit directly below their card titles, above the amount, including per-job tunnel/congestion cards. Existing warnings remain below amounts. All 43 focused UI tests passed, including caption-order assertions; scoped whitespace checks passed. UI only, no push/deployment.
- [x] Rename the tunnel/congestion calculated charge cards to Expected, including per-job summaries; congestion table now says Expected fee. Calculation sources remain unchanged. All 45 focused UI tests and scoped whitespace checks passed.
- MA Yesterday read-only check (2026-10-11): TMV-8B626F68AE manual items contain GBP 13.60 tunnel and GBP 18 congestion; saved job fees agree but are marked driver-selected-unverified, with zero confirmed crossings. System working boundaries span about 1.5 minutes versus 344 minutes reported manually. Expected cards use qualifying GPS-linked activity rather than saved/manual selected fees, so their zero is not proof that no fee was due. Exact provider activity/linkage still needs review; no data correction, provider calls, push or deployment performed.
- [x] Per-job charge comparison follow-up: replace saved congestion/tunnel fee amounts with the same job-linked Expected totals used in the per-job road-charge cards. Compare against saved manual charge items, label Expected/reported explicitly and use the new basis in the discrepancies filter and PDF comparison. Multiple tunnel passages sum their allocated charges; congestion retains existing once-per-job allocation. Pending/failed GPS loads remain Loading/Unavailable, and incomplete evidence cannot produce a verified match badge. Saved job prices and billing are unchanged.
- [x] Verification: 45 focused UI/helper tests, nine PDF/export tests, both TypeScript checks and scoped whitespace checks passed. User checkpoint: compare Expected/reported rows to each job's road-charge cards, including a multiple-passage job and a job with no matching GPS activity. No push/deployment or production changes.
- [x] Comparison range totals follow-up: add total Expected and reported tunnel/congestion amounts on their respective sides. System Expected Amount sits above Driver Collected; manual Total Amount is renamed Reported Amount. Expected road totals are computed before pagination for the completed financial-job cohort, excluding unlinked/out-of-cohort activity. Available reported subtotals retain red missing/unavailable counts; GPS totals retain Loading/Unavailable states.
- [x] Verification: 30 backend road/report tests, 44 comparison/page UI tests, both TypeScript checks and scoped whitespace checks passed. User checkpoint: open Comparison with more jobs than one page and confirm Expected Amount order, Reported Amount label and both road-charge totals. No push/deploy or production data changes.

### Authorized Release Checkpoint (2026-10-12 Asia/Karachi)
- [x] User explicitly authorized check, push and deploy. Production checkout is clean at 30373a0; existing container/health endpoint are healthy. Preserve production configuration and existing data.
- [x] Read-only London-day check: no current-day IN_PROGRESS jobs. Thirteen older IN_PROGRESS records remain, last updated September to 3 October; leave them unchanged. Previously scheduled final job is COMPLETED.
- [x] Full backend suite: 565 tests / 62 files. Full frontend suite: 371 tests / 74 files. Both production builds passed. Both production dependency audits report zero vulnerabilities. Existing frontend bundle-size/build-tool review and physical GPS/device acceptance limitations are not claims of resolved live validation.
- [x] Pushed application/source/tests/docs as c101cfb, excluding environment credentials, generated output and local attachments. Fast-forwarded the clean server checkout without reset; built the image before replacing the running container. Activated at 2026-10-11T19:13:47Z (2026-10-12 00:13 Asia/Karachi). Production configuration was preserved. Old image retained as tmv-pwa:pre-c101cfb; do not treat an older build as automatically compatible with newly saved manual/billing records.
- [x] Both chat.themanvan.co.uk and dashboard.themanvan.co.uk return HTTP 200 health/shell/assets and serve frontend build c101cfb. Protected report returns 401 without authentication. Authenticated MA core report returns 200 with expected/reported road totals, deferred GPS and omitted liabilities. Mongo indexes verified at startup; container running with zero restarts and no startup errors in checked logs.
- [ ] Full customer-linked production report/PDF smoke check: safety review blocked execution because it exports sensitive customer data; separately requested explicit MA-only approval. No full report/PDF downloaded for this release check. Synthetic regression/export tests passed; this limitation is separate from successful deployment.
- [ ] Client checkpoint: install the PWA update and verify driver completion/manual form plus admin report/filter/comparison/PDF workflows on actual devices. Controlled physical GPS evidence and separately approved historical backfill remain outstanding.
