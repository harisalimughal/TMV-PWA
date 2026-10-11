# Driver road-charge alert view

Local implementation, 2026-10-10. No production data reads/writes, GPS changes, push or deployment were performed during verification.

## Why the old view showed zero

The Alerts page queries GPSLive alert history directly. Driver Reports previously queried only persisted GPS ledger data and counted physically verified tunnel crossings, which additionally require portal geometry/position evidence. Alerts can therefore exist without ledger visits or confirmed physical crossings.

## New report behavior

- Read the same bounded fleet alert history as Alerts, merge with recorded ledger events by provider identity, and reconstruct distinct entry records without saving/importing anything.
- Preserve repeated entry alerts when exits are missing. Deduplicate identical events, overlapping congestion sectors and short boundary jitter. Exit-only alerts are not new entries.
- Prefer recorded job/device intervals. For legacy alerts, a current driver match and unique recorded job-time interval can supply a labelled driver/time link. Overlapping identities never become guessed job charges; unlinked alerts do not invent customer fees.
- Apply the supplied Europe/London windows: tunnel 06:00-22:00 daily; congestion 07:00-18:00 weekdays and 12:00-18:00 weekends. Start inclusive, end exclusive.
- Estimate tunnel fees per alert passage; allocate congestion once per qualifying job. Use the effective saved job tariff where available, otherwise current Pricing Settings explicitly labelled as an estimate.
- These are alert-based estimates, not confirmed physical tunnel counts, historical tariff reconstructions, authority costs, automatic obligations or edits to accepted job totals. Existing strict verification/ledger rules are unchanged.
- Totals cover all returned matching entries, independent of display pagination. GPSLive's existing 500-row fleet response limit is retained and labelled when reached; this does not prove provider completeness.
- Tunnel/congestion views replace warning-heavy verification sections with entry/exit times, duration, charging window, estimated fee and linked job IDs. Clicking zone/job opens full associated alert details; the dialog retains a separate Open Job command.
- Modal state clears when driver/date/type changes. Date and driver changes reset alert pagination.

## Verification

Synthetic tests cover provider-history-only data, deduplication, missing exits, overlapping sectors, charging windows, congestion allocation, saved/settings rates, unmatched/overlapping job ownership, full-range scheme pagination and modal/job navigation. Desktop dialog and mobile congestion layout were inspected in the isolated fixture browser. Real provider/MA output still requires local client review.

Backend full regression passed 503 tests/52 files before the final focused additions/refinements; the final road-alert/report suites passed 19 tests/3 files. Backend TypeScript checks passed. Frontend full regression passed 249 tests/55 files; final focused report checks and frontend build (including TypeScript) passed. Existing build chunk-size warnings remain unrelated to this change.
