# Phase 4: Charge Rules and Verification

Date: 2026-10-09. Status: implemented and tested locally. Not released; live database/provider and real portal-route validation remain prerequisites.

## Accepted Customer Policy

| Customer Fee | London Charging Window | Allocation |
| --- | --- | --- |
| Tunnel | Every day, 06:00 inclusive to 22:00 exclusive | One fee per confirmed qualifying physical crossing |
| Congestion | Monday-Friday, 07:00 inclusive to 18:00 exclusive | One fee per qualifying job |
| Congestion | Saturday-Sunday, 12:00 inclusive to 18:00 exclusive | One fee per qualifying job |

These are the user's business schedules, including holidays. No authority holiday/exemption policy is silently substituted. All monetary rates come from `CONGESTION_CHARGE` and `TUNNEL_CHARGE` Pricing Settings, with existing configured environment defaults only when no override exists. GBP 18 / GBP 13.60 appear in fixtures, not as hardcoded runtime prices.

New on-my-way actions capture a versioned job tariff snapshot with effective/capture instants and integer-pence rates. A later pricing edit or Calendar sync cannot reprice that job. Invalid explicit rates are null, not zero. Existing active/completed jobs are not assigned current rates retrospectively; historical expectations without a valid snapshot require verification.

## Evidence and Billing

- Customer eligibility requires recorded historical tracker ownership and activity within the recorded Arrival-to-Empty-Van interval. Approach events, completion fallback boundaries and ambiguous/legacy-only ownership are not automatic billing proof.
- Congestion requires an observed in-job union-zone entry during the charging window. Remaining inside when the window opens, starting inside, or staying overnight does not invent another entry. Repeated qualifying entries are retained but create only one customer fee for that job.
- Tunnel proof needs verified opposite portal/route evidence from Phase 3. Geofence entry/exit alone is not proof of a crossing. Qualifying proof intervals must be within the job; the proof completion instant is the reporting timestamp. If portal samples straddle opening/closing, the precise crossing time is unknown and the fee requires review.
- New-job suggested totals include observed qualifying congestion and tunnel fees, including multiple confirmed tunnels. Total confirmation saves the amounts, proof references, crossing count, rule version and per-type billing source in `chargeSnapshot`. Existing confirmed/completed totals remain unchanged when later GPS history arrives.
- Driver-selected fees without qualifying GPS proof retain their existing operational entry path, explicitly labelled `driver-selected-unverified`; they are not called GPS-verified or assumed to prove physical activity. Trustworthy activity observed only outside charging hours removes that selected fee from the new system calculation. Manual customer-fee entries remain independent locked comparison evidence.
- If a selected/confirmed fee has an invalid frozen rate, confirmation is blocked for verification instead of silently charging zero. Duplicate allocation conflicts likewise block a second confirmation.
- GPS expectations are an observed minimum, not proof of complete provider coverage. Unknown GPS/rates/boundaries/conflicting allocation amounts remain null. No fees are added again to manual collection amounts; fees are components of those collections, not separate receipts.

## Allocation Guards

`road_charge_allocations` stores immutable customer amounts and ownership. Congestion scopes are job-based; tunnel scopes are physical tracker/scheme/London date, with distinct crossing intervals inside each ledger. Unique `_id` values and revision compare-and-swap serialize concurrent claims across application processes without requiring a replica-set transaction.

Repeated imports, retries and overlapping/enriched physical proofs reuse one allocation. Different drivers/jobs cannot own the same crossing twice. Genuine separate crossings remain separate. Saved prices are never overwritten by a new rate. Contention retries are bounded at 12; an unresolved conflict fails for retry without returning success or counting a new fee. Each vehicle/scheme/day ledger is bounded at 2,000 allocations.

`road_authority_obligations` is separate. Congestion references share a vehicle/scheme/London-day key across jobs/drivers; tunnel references reuse the canonical physical allocation. Multi-day jobs and van swaps retain the appropriate separate authority references. Authority amounts stay null because verified vehicle class, account/payment arrangement, exemptions and scheme/direction tariffs are unavailable. Customer Pricing Settings fees must not be summed as government road costs.

Saved allocations that cannot be reproduced from current evidence remain audit records with a review flag, not extra current expected fees. Future report filters must use the canonical obligations, not sum repeated job/context references.

## Admin API

Under the existing authenticated `/api/admin/gps` router:

- `GET /jobs/:jobId/charges`: read-only charge assessment, per-visit eligibility explanations, obligations, tariff/evidence provenance, authority references, saved allocations, comparisons and flags. Does not allocate charges, edit manual data, call the GPS provider or change a customer's price.
- `POST /jobs/:jobId/charges/reconcile`: explicit idempotent allocation/reference persistence. A partial storage failure returns an error and can be retried; persisted ownership/price guards remain intact. Does not edit a locked manual summary or accepted customer total.

Flags include Missing charge, Amount mismatch, Manual only, Outside chargeable hours, Duplicate allocation and Needs verification. A manual-only or excess fee is a review signal, not evidence proving fraud or off-app collection. Returned signed differences compare fee components; full outstanding/excess-collection reconciliation is Phase 6.

The full driver report and side-by-side system/manual dashboard are Phase 6/7 work. This phase delivers their shared charge foundation, not a new dashboard screen.

## Local Verification

- Full backend regression: 378 tests passed across 35 files.
- Phase 4 coverage includes 55 rule/rate tests, 7 atomic allocation tests, 7 billing tests, 5 report-service tests and 10 notification tests.
- Backend TypeScript typecheck and build passed; web typecheck passed.
- `git diff --check` passed with Windows line-ending warnings only.
- Fixtures cover before/at/after all supplied boundaries, weekdays/weekends/holidays, London DST, overnight and pre-window occupancy, repeated entries, duplicate passage evidence, multiple real crossings, overlapping proof intervals, van swaps, missing GPS, unknown/zero rates, fallback boundaries, concurrent competing allocations, failed storage/CAS retries, frozen amounts, read-only reports and Calendar snapshot preservation.

Tests use synthetic GPS data and mocked persistence/provider boundaries. No real Mongo concurrency or live physical-route validation is claimed. No backend server was started, private GPS import or production database write was performed, and nothing was pushed, committed or deployed. Environment files were not edited.

## Check Before Progression

1. At fixture rates GBP 18 and GBP 13.60, one congestion entry plus two confirmed tunnels gives GBP 45.20 in road-fee components. Repeated congestion entries on that job do not add another GBP 18.
2. Two qualifying jobs using the same van each receive their own congestion customer fee. Their authority-day reference is shared; its government amount remains unknown.
3. A Friday entry at London 06:59 followed by remaining inside after 07:00 does not qualify. A fresh observed entry at 07:00 does. A weekend entry before 12:00 does not qualify.
4. A tunnel proof wholly outside 06:00-22:00 creates no automatic toll. Proof spanning a window boundary or lacking real portal confirmation requires verification. Missing GPS is unknown, not a proven zero crossing count.
5. Confirm that historical accepted totals remain frozen and driver manual fees stay locked and independent. Review discrepancies before treating them as liabilities or collection shortfalls.

Before release, validate all of this with an isolated test database, approved real tracker routes/portal geometry, and admin authorization/retry checks. Existing Phase 9 migration/deletion/release checks still apply. Do not backfill or run production maintenance implicitly. The next phase must preserve the agreed exclusion of driver-entered monetary liability/parking charges.
