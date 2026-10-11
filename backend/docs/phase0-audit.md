# Phase 0 Data, Capability and Policy Audit

Audit date: 2026-10-09. Final sampled database/GPS observation: 07:19:53 UTC (12:19:53 Asia/Karachi). Evidence is from the configured backend database and GPSLive account; this document does not assume all rows are production jobs.

Operations were read-only: Mongo find/aggregate and documented GPSLive read/search endpoints. No server/background sync was started; no indexes, job records, provider geofences, notifications, payments, or configuration were changed. Output excludes credentials, customer details, account identities, plates, IMEIs, precise locations, and actual job IDs.

## P0.1: Field Inventory and Representative Data

| Existing Field | Observed Meaning / Reporting Rule |
| --- | --- |
| bookedStart / bookedFinish | Calendar booking instants; their difference is exact scheduled duration. Base price/crew/booking times freeze when actualStart exists. |
| bookedMinutes | Existing minute-rounded derivative; calculate new exact allocation from Calendar instants. |
| actualStart / pickupArrivalAt | First accepted Arrival-photo workflow time, assigned server-side; preserve provenance because photo capture and GPS arrival are distinct. |
| actualFinish | First accepted EmptyVan-photo workflow time. Subsequent signature/payment/review/manual entry must not extend operational time. |
| trackerArrivalAt | Fresh tracker verification, separate from driver/photo start. Existing polling uses two distinct in-radius reports, a 300m radius, and 2-minute freshness. Proof-upload fallback accepts up to 30-minute-old positions, so it must not be presented as an exact arrival instant. |
| clientSignatureAt | Customer sign-off time; extra-charge/payment workflow follows sign-off. |
| extraChargeText | Calendar-sourced overtime rate text; currently refreshed even on a started job. New billing needs a frozen rate snapshot. |
| basePrice / overtimeCharge / amountCharged / calculatedTotalCharges | Existing job storage uses pounds. Convert at one explicit boundary to integer pence in snapshots/reports; do not relabel old numeric fields as pence. |
| calculatedTotalCharges / totalCharges | System price at final-total submission, distinct from amount collected. |
| amountCharged | Final customer price, possibly adjusted with a reason, assigned before payment submission; not a payment receipt. |
| paymentBreakdown | Driver-recorded per-method amounts in pounds. Invoice is currently recorded as zero; other amounts are entered through the payment workflow. They remain reported, not payment-provider-confirmed. |
| paymentStatus | Recorded/Outstanding/Paid Online/Pending context; Invoice selection produces Outstanding. |
| paidOnline | Calendar-title Y interpreted by the parser; no independent paid amount or payment-provider transaction is stored. Do not fabricate a prepayment amount from this flag. |
| driver_job_summaries | Locked manual entry per job; pence amounts, helper fields, manual times. Old Invoice/Transfer cannot be split reliably. |
| congestionZoneEnteredAt / tunnelZoneEnteredAt | First-entry suggestion flags; not complete crossing histories or reliable event time after delayed delivery. |
| gpsliveImei | Device pinned to the job; historical attribution must use this/time intervals rather than current van assignments alone. |
| scenario_submissions | Parking/damage evidence, signatures, free-text fields, submitter and job link; no structured monetary/resolution ledger. |

Database observations:

- 726 jobs: 456 READY, 18 IN_PROGRESS, 228 COMPLETED, 24 CANCELLED.
- 205 scheduled durations are not whole hours; none of the inspected booked boundaries has invalid/non-positive duration.
- All 228 completed rows have actual boundaries, but presence alone does not prove physical accuracy; very short recorded durations exist and must remain reviewable.
- 608 rows have rate text: unit heuristics found 597 half-hour and 11 hourly texts. This is a format inventory, not full rate parsing/validation.
- 685 rows have paidOnline true. This makes unsupported automatic credit from that flag a material reporting risk.
- Eight rows have split payments; recorded methods include Cash, Card, Bank Transfer, Link, Invoice.
- Ten completed rows with a payment breakdown differ between final price and summed entered payments. An authorized adjustment, prepayment, invoice, bad entry, or incomplete data must be considered before a discrepancy is called misconduct.
- There are currently zero locked manual summaries. Preserve legacy missing submissions and apply a future mandatory-summary activation boundary.
- 206 jobs have a pinned tracker; 22 have tracker-arrival verification; 24 congestion and five tunnel first-entry flags exist. Flags are not crossing totals.
- Nine driver profiles have assigned tracker IDs; current GPS account device count/active status differs, so never infer an active association solely from profile presence.
- 71 parking and 55 liability submissions exist, plus four check-in and three checkout records.

Effective saved customer-fee settings at observation: congestion GBP 18; generic tunnel GBP 13.60; 1/2/3-person crew rates GBP 45/55/65; packing GBP 95. No saved explicit overtime override, grace, or crew billing-unit value was returned. Environment/code fallbacks must be labelled and validated. The generic tunnel setting is a customer fee, not proof of the government's individual-crossing tariff.

Anonymized representative completed rows:

| Sample | Scheduled / Actual Minutes | System / Final Price | Entered Payments | Manual |
| --- | --- | --- | --- | --- |
| 1 | 120 / 158.39925 | GBP 203.10 / GBP 203.10 | Card GBP 150 + Cash GBP 120 | Missing |
| 2 | 120 / 0.5839333333 | GBP 141.60 / GBP 141.60 | Card GBP 450 | Missing |
| 3 | 120 / 159.4791666667 | GBP 185 / GBP 185 | Card GBP 180 | Missing |

These samples show why final price, receipts, prepayment flags and manual submission coverage must remain distinct. No historical prices were recalculated.

## P0.2: GPSLive Capabilities and Limits

Public API schema inspected as JSON embedded in [GPSLive Swagger initialization](https://api.gpslive.app/api-docs/v1/swagger-ui-init.js), reached through [official API documentation](https://api.gpslive.app/api-docs/v1). The embedded configuration was parsed, not executed.

| Endpoint | Confirmed Capability | Sample Result |
| --- | --- | --- |
| GET /v1/devices/list | Current coordinates/speed, odometer, tracker timestamp, active state and sensor parameters | HTTP 200; 10 devices, eight active |
| GET /v1/places/zones | Stable zone IDs, names and polygon vertices | HTTP 200; six relevant zones |
| GET /v1/alerts/notifications | Recent fleet alert feed | HTTP 200; 15 sampled rows; documentation describes latest 50 |
| POST /v1/alerts/custom | Read/search by devices, SQL date range, search and requested limit | HTTP 201 is success; 27 sampled rows in a requested 7-day/50-row window for one device |
| POST /v1/devices/history | Historical timestamped coordinates, speed and parameters | HTTP 201; 219 points in a 2-hour sample |
| POST /v1/trip-history | Routes, driving/stopping/idle intervals, event coordinates and aggregated durations | HTTP 201; 208 route points, one drive, two events in the sample |

No undocumented endpoint or provider write operation was used. Search POSTs retrieve history; they do not create GPS records.

- Alert rows contain stable event_id, type, dt_tracker, device identity, speed/angle/altitude. Sampled alert rows have no lat/lng.
- Trip event rows contain coordinates and event type/time/description, but no stable event_id in the sampled shape. Correlate them with alerts using device/time/type/zone evidence and mark uncertainty; do not assume identical IDs or exact equality.
- Trip routes include server/tracker time and coordinates; drive intervals include dt_start/dt_end and moving_duration_time. Sample aggregate 3393 corresponds to formatted 56m 33s, confirming seconds for this sampled movement field.
- Position gaps in this moving-device sample: median positive interval 17 seconds; maximum 614 seconds. This is an observed sample, not a tracker update guarantee. Large gaps can hide crossings and arrival precision.
- Tracker SQL timestamps have no explicit offset. Freshest sample was about 0.08 minutes old when interpreted as UTC and 60.08 minutes old when interpreted as London local time. This supports the existing UTC interpretation for this account, but retain timezone provenance and validate against server time; DST tests remain required.
- No rate-limit/retry-after header was present in the inspected device response. Numerical API quotas were not documented in the inspected schema; use bounded sequential requests/backoff, not unrestricted fleet fan-out.
- Alert schema exposes a limit but no documented cursor/page token. If a history slice reaches its requested limit, split the interval and deduplicate overlapping results; if saturation cannot be resolved, report partial coverage.
- Historical retention days are not specified by this schema or established by this sample. Query only available bounded windows, retain imported events locally, and show missing-range/retention coverage. Never label a week complete merely because one query returns fewer rows than its limit.
- No zone_out was observed in this sample; this does not prove exits never exist. Reconstruct visits using entry/exit alerts and trajectory evidence; missing exits leave time-in-zone unknown.
- Grouped geofences and gaps can identify a toll scheme without proving which individual tunnel/direction was used. Use Unknown tunnel/direction and expected road cost null until sufficient route evidence exists.

## P0.3: Geofence Mapping

| Provider Zone ID | Provider Name | Scheme Mapping | Handling |
| --- | --- | --- | --- |
| 10377 | Congestion | London congestion | Main polygon; union with sector polygons for one physical zone |
| 10378 | Congestion Zone E | London congestion | Do not count overlap/sector transitions as new chargeable days |
| 10379 | Congestion Zone NE | London congestion | Same obligation scheme |
| 10380 | Congestion Zone SW | London congestion | Same obligation scheme |
| 10381 | Dartford Crossing | Dartford | Match by zone identity/name explicitly; current case-sensitive Tunnel substring logic can miss Dartford alerts |
| 47814 | Tunnels-Black-Silver | Blackwall/Silvertown combined scheme | Provider name alone cannot select one tunnel. Retain combined scheme; derive individual tunnel/direction from adequate route evidence or leave unknown |

There is no separately named Blackwall or Silvertown polygon in the returned account data. No provider geofences were created or edited. Need for individual geofences remains an external setup option, not a prerequisite for showing truthful scheme-level records.

## P0.4: Policy Decisions

User-provided regular windows and London timezone are the baseline. Specific monetary/boundary policies below are recorded as proposals, not approvals. The async questions presented during this audit are still awaiting the user's answers.

| Decision | Audit Outcome / Proposed Policy | Remaining Input |
| --- | --- | --- |
| D01 | Resolved 2026-10-09: use Europe/London and the user-provided charge windows. Start boundary is included; end boundary is excluded. | Implement and test exact-boundary cases |
| D02 | Resolved 2026-10-09: customer fees come from Pricing Settings at job snapshot time. Current observed settings are GBP 18 congestion and GBP 13.60 generic tunnel. Store separately from authority road costs. | Implement settings snapshots and source labels |
| D03 | Resolved 2026-10-09: customer charging follows the user's regular schedule only. Official holiday/tariff exceptions are not applied to customer fees unless later requested; they can appear as separate authority-cost notes when evidence exists. | Implement customer schedule as approved |
| D04 | Resolved 2026-10-09: ceil any positive excess into a full half-hour block. Calendar rate is first source. If no usable Calendar rate exists, read Pricing Settings `OVERTIME_RATE_PER_30`; if blank, use the existing crew/packing rate fallback. Label the applied source in the snapshot. No additional grace has been approved. | Implement and test in Phase 1 |
| D05 | Resolved 2026-10-09: customer charges are job-based. If the driver enters congestion during that job in the chargeable schedule, charge that job. Tunnel charges apply per confirmed chargeable crossing associated with the job. No vehicle-day first-job allocation is used for customer charging. | Implement job-linked fee allocation and discrepancy flags |
| D06 | Resolved 2026-10-09: manual payment entries are per-job manual entries/collections. Existing final price, driver-recorded payments, invoice/outstanding rows and independently confirmed prepayments remain separate; do not fabricate prepaid receipts or double count. | Implement per-job manual comparison |
| D07 | Resolved 2026-10-09 for current scope: existing incident records remain evidence-only. Do not collect driver-entered parking/liability amounts now; keep amounts unknown unless already present from another approved source. | Leave driver liability-charge intake out of this feature increment |
| D08 | History and movement capabilities confirmed; sampling/retention/identity gaps documented. Billing baseline uses recorded operational start/finish, with GPS/photo provenance alongside it. | No provider capability invented; verify physical precision during Phase 3 |

Current authority references were checked 2026-10-09:

- [TfL Congestion Charge](https://tfl.gov.uk/modes/driving/congestion-charge): daily charge; bank-holiday schedule and Christmas/New Year exception.
- [TfL Blackwall/Silvertown charges](https://tfl.gov.uk/modes/driving/silvertown-blackwall-tunnels-charge/paying-blackwall-and-silvertown-tunnel-charges): each crossing, both directions; rates changed 21 September 2026. Small-van Auto Pay off-peak/peak rates GBP 1.55/4.20; large-van rates GBP 2.60/6.80. Weekday peak windows depend on direction. Christmas Day exempt. Do not apply the old leaflet's amounts to current journeys.
- [Dartford charges](https://www.gov.uk/pay-dartford-crossing-charge/charges): 06:00-22:00 daily; two-axle goods vehicles GBP 4.20 one-off/pay-as-you-go or GBP 3.60 pre-pay. Account/class/discount evidence is needed for the actual vehicle.

Company customer fees may differ from those authority costs. No customer fee was changed during the audit.

## P0.5: Acceptance Inputs and Migration Design

Completed technical deliverables:

- `backend/test/fixtures/phase0-cases.json`: six supplied timing examples, three anonymized recorded durations, rate-format cases, split/manual/prepayment/invoice financial cases, duplicate/overlap/daily/per-crossing/boundary/missing-data GPS cases, and liability cases.
- `backend/docs/driver-report-contract.md`: versioned endpoint/data contracts, date scopes, null/coverage semantics, event-obligation-allocation separation, manual amount basis, historical attribution, and twelve migration/activation steps.
- `backend/scripts/phase0-audit.cjs`: repeatable read-only, sanitized database/provider audit. Public docs options read embedded JSON without executing fetched code.
- Existing calculator tests consume the six client examples and three recorded-duration cases. Non-timing expected outcomes remain specifications for the corresponding future engines; they are not claimed as implemented financial/GPS verification.

Preserve existing completed prices, locked summaries and provider data; future financial activation is prospective. The 228 legacy missing manual forms are exempt from automatic queue blocking. Booking sync must preserve new snapshots. Job-delete/factory-reset paths must incorporate new records without deleting a shared vehicle/day charge allocated to another job.

## Completion Status

P0.1, P0.2, P0.3, P0.4 and the technical P0.5 deliverables are complete, with provider limitations explicitly recorded. Phase 0 is COMPLETE as of 2026-10-09. No runtime workflow was activated by this document; Phase 1 and later phases must still implement and test the accepted policies before release.
