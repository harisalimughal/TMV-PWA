# Phase 3: GPS History and Accuracy Verification

Date: 2026-10-09. Status: implemented and verified locally; not deployed or certified against physical tracker journeys.

## Delivered

- Raw entry/exit ledger persists before job matching and legacy notification suppression. Unknown zones, missing identity/time, delayed delivery and conflicting provider IDs remain available for investigation. Event time and first/last receipt time are separate.
- Mongo indexes and deterministic IDs support repeat imports/webhooks. Source provenance and conflicts are retained rather than silently overwriting the first observation.
- Bounded alert, position and trip history imports retry failures, split saturated time windows, checkpoint successful slices and resume incomplete runs. Successful ranges can be refreshed for late history.
- Historical tracker assignments are saved on jobs. Matching uses occurrence time and assignment intervals, not a driver's current profile, registration or the currently active job. Ambiguity stays unresolved.
- Congestion sectors form a union; repeated samples, overlapping alerts, short boundary jitter, missing exits and starting inside a zone are handled without inventing observed entries.
- Tunnel geofence passages are separate from confirmed physical traversals. Configured opposite portal polygons, plausible routes and bounded signal-gap evidence can confirm traversal. Long gaps, U-turns and overlapping proofs remain unverified.
- Moving, stationary, ignition-on idle, engine-off stationary, approach, on-job and recorded working time are distinct. Point gaps and unallocated provider drives remain unknown; overlapping sources are never added together.
- Pickup arrival requires two distinct stationary reports from the same tracker within the 300 m radius. Reports must be no older than 120 seconds, not future-dated and not before on-my-way. Active job pins take precedence over later profile changes. Photo acceptance remains a separate operational boundary.
- Admin job normalization exposes arrival-delay provenance. Existing elapsed-job hours are labelled Working Hours, not falsely advertised as GPS Moving Hours.

## Admin API

All routes are mounted under existing admin authentication at `/api/admin/gps`.

- `GET /events?from=<offset ISO>&to=<offset ISO>&imei=<optional>`: persisted ledger with historical association, including invalid/missing-time events selected by receipt time. Maximum range 31 days; paginated up to 200 records per page.
- `GET /jobs/:jobId`: persisted observations, visits, portal proof positions, counts, movement/working-time evidence, coverage and sync metadata. Does not trigger provider writes or imports.
- `POST /sync`: body `{ imei, from, to }`; imports read-only provider history into the application's database. Explicit timezone offsets, numeric IMEI and at most seven days are required. This request is synchronous and bounded; after a client timeout, consult monitoring/checkpoints before retrying. A retry waits for the same-device lock and deduplicates saved data.

The operational sweep is single-flight, runs every 15 minutes, processes at most two devices per pass, resumes incomplete intervals and uses a bounded recent window. It is not a fleet-wide historical backfill.

## Limits and Evidence Labels

- History queries use six-hour slices, at most 128 logical source queries per requested import; background imports use 18. HTTP retry attempts are additional. Alert saturation is 500 rows; position/route saturation is conservatively 5,000. Saturated slices split down to a one-minute minimum; unresolved saturation remains Partial.
- Job reads cap each events/positions/drives dataset at 20,000 rows and sync metadata at 100 runs, with Partial coverage on truncation. Job monitoring reads at most seven days of context, not unlimited history.
- A `queried` run means its bounded provider requests completed, not that every real movement was recorded. Provider retention, undocumented caps and missing tracker signal keep provider completeness Unknown.
- SQL-like GPSLive timestamps are interpreted as UTC with `provider-assumed-utc` provenance. Explicit offsets are preserved. This is supported by the Phase 0 sample audit but is not an official timezone guarantee.
- Idle requires usable ignition evidence. No tracker means Unavailable moving time, not zero. Administrative completion-fallback boundaries do not become measured working hours.
- Legacy congestion/tunnel flags and their existing notification suppression are not authoritative crossing counts. Their monetary replacement and the supplied London charging windows are Phase 4; no new charge calculation is activated in Phase 3.
- Mutexes follow the repository's existing single-process assumptions. Multi-instance/distributed coordination is not claimed.

Provider response structures were checked against the public [GPSLive API schema](https://api.gpslive.app/api-docs/v1) and Phase 0 audit evidence. No private GPS history was imported during this phase.

## Verification

- Final full backend regression: 302 tests passed across 31 files, including the final arrival cleanup and monitoring coverage checks.
- After final arrival-state cleanup: 42 GPS/arrival tests passed across four files.
- Added monitoring acceptance checks: four tests passed for absent trackers, incomplete imports, fallback working-time exclusion and unknown jobs.
- Backend TypeScript build passed; web TypeScript/production build passed.
- Affected dashboard tests: 13 passed across three files.
- `git diff --check` passed, with existing Windows line-ending warnings only.

Tests use synthetic data and mocked database/provider boundaries. They cover delayed/out-of-order events, duplicates, van/driver swaps, ambiguous intervals, overlap/jitter, missing exits, starting inside, U-turns, bounded/long tunnel signal gaps, UTC/DST parsing, stale/future GPS, drive-bys, movement gaps and non-duplicated durations. Synthetic portal polygons are not real crossing coordinates.

## Review and Release Prerequisites

1. Review the evidence/coverage semantics above before proceeding to Phase 4. The dashboard redesign and manual/system comparison remain later phases, not delivered screens in Phase 3.
2. Supply verified portal polygons for the monitored crossings, including tunnel names and activation instants. Configure `GPS_TUNNEL_PORTAL_RULES` in settings using `{ id, scheme, tunnelName, effectiveFrom, sideA, sideB }`; polygon pairs are `[latitude, longitude]`, not GeoJSON order. Default is `[]`, which deliberately confirms no physical crossings. The combined Blackwall/Silvertown zone alone cannot establish the individual tunnel.
3. In an isolated test database, verify index creation, repeated/concurrent webhook persistence, checkpoint restart and authorized admin endpoints using approved provider reads. No real MongoDB integration smoke test was run here.
4. Validate representative real tracker routes: both directions, approach without traversal, long signal loss, van swap, repeated congestion entries and a driver stationary at pickup. Confirm provider timestamp timezone and sampling behavior.
5. Check the arrival-delay source label and Working Hours wording on the admin page and exported report. Browser screenshots and physical-device verification are not claimed.

Nothing was pushed, deployed or committed. The backend server was not started, so new background provider reads and database persistence were not activated during implementation. Existing environment files were not changed.
