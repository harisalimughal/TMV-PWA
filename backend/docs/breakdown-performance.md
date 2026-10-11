# Driver Breakdown loading optimizations

## Scope

Local implementation only. No deployment, database/provider access, schema/index changes or financial recalculation.

## Changes

- Full report reads share a process-local result for 30 seconds, keyed by driver, exact range and grouping. Scheme/page responses paginate that same full result rather than rebuilding the report. At most eight reports are retained; oversized reports only share concurrent reads.
- Driver summary results share a 10-second, 12-entry cache keyed by range and moving-data option. Concurrent identical requests share a single read. Other summary callers do not request movement data.
- Job, evidence, manual submission, pricing-setting and driver-account writes invalidate both caches. Existing dashboard invalidation also clears them. In-flight reads from before invalidation cannot refill the cache.
- Reports and summaries reuse recent frontend responses for five seconds. Summary requests consume the query cancellation signal. Date controls remain usable during report loading, without displaying another filter's totals.
- PDF/Excel exports always build a fresh full-range report; they never consume paginated or cached display totals.
- Moving-hour summaries read only GPS positions and drives, excluding unrelated events/sync runs. Position payloads include only ownership/movement fields. Each historical device is still read once, with the existing 20,000-record limit and explicit truncation.
- Device-indexed ownership lookups retain all historical assignment, overlap, conflict and timestamp rules. Job/event/visit/charge lookup maps replace repeated whole-array scans without changing calculation order or totals.
- Independent driver/profile and job reads overlap; stored GPS history and provider alert reads overlap. Provider queries, ownership checks, missing/partial labels and financial verification remain intact.

## Freshness and limits

Caches are bounded, per-process and not authoritative storage. Database writes made through this app invalidate them immediately; external database/GPS/provider changes age out within the short TTL. A frontend response can remain reusable for another five seconds. Report generation timestamps remain unchanged on cache hits.

Cold requests still need Mongo/GPSLive reads and can remain limited by network/provider latency. No live timing benchmark or speed percentage is claimed. The regression checks prove repeat requests avoid duplicate reads, movement-only queries touch two collections instead of four, invalidation reloads changed financial totals, exports bypass display caches, and indexed ownership agrees with the original algorithm.

## Verification

Full backend: 60 files / 528 tests passed. Frontend full run: 59 files / 285 tests passed, with one outdated Overview assertion expecting the previously removed review column; updated that fixture and its 2-test rerun passed. The focused Breakdown/filter suite passed all 38 tests. TypeScript, both production builds and synthetic browser tab/date navigation passed. No real database writes or provider changes were part of these checks.
