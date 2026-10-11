# Pickup Arrival Verification

Client revision, 2026-10-11. Local implementation only; no deployment authorized.

The pickup tracker radius is 500 metres, inclusive, defined by PICKUP_ARRIVAL_RADIUS_METERS. The polling and proof-upload paths both use the same assessment. A fresh 405m or 500m report is inside; 501m is outside. Existing coordinate validity, two-minute freshness, non-future timestamps, job On My Way boundary, same-device attribution and stationary-speed checks remain. Two distinct qualifying reports within five minutes are still required; a single position or drive-by never confirms arrival.

The first qualifying report saves trackerArrivalCandidateAt and trackerArrivalCandidateDistanceMeters. Confirmation saves that first timestamp with trackerArrivalDistanceMeters and clears the candidate fields. trackerDistanceMeters remains the separate latest report distance; later updates do not alter the frozen arrival distance. Stale/outside/changed-device candidate handling remains conservative. Calendar edits preserve or clear both new fields using the same rules as their associated arrival timestamps.

Admin job detail, Finished Jobs, paper previews, report milestone tables, generated PDFs and tracker-arrival email fields display the saved distance in brackets beside a recorded arrival time, for example 09:00 (405 m). Missing historical distances display distance not recorded rather than substituting a later vehicle position. Report exports also include the frozen distance metadata. Unverified historical jobs are not retrospectively assigned arrival times or new distance snapshots.

No GPS tunnel/congestion charging boundaries, stored prices or completed-job records are changed by this revision. The separate driver-device proximity helper is not this GPSLive tracker rule and is unchanged.

Verification: full backend 561 tests / 62 files passed; focused tracker/report/preview frontend 48 tests / 5 files passed. Tests cover 405/500/501m, confirmation at photo upload, first-report distance retention, later position updates, booking resets, milestone projection, zero and missing distance labels.
