# Global search (Ctrl/Cmd K)

The admin's command palette searches drivers, jobs, customers, vans, liability records,
alerts, pages and actions, and opens the exact record. Code: `src/screens/admin/dashboard/search/`
and `components/CommandPalette.tsx`.

## What each result opens

| Type | Source | Opens |
| --- | --- | --- |
| Driver | Driver roster (`/api/admin/drivers`, already cached by the dashboard) | Driver report, last 7 days (`?section=driverreport&driver=KA`) |
| Driver report tab | Roster + a tab word ("Tiago congestion") | That report tab |
| Job | `/api/admin/jobs?q=` (one page of 20) | The job drawer (`?job=`) over the current page |
| Customer | Names on the matching jobs (customers have no record of their own) | Jobs list searched for that name, all dates |
| Van | Roster registrations + one page of `/api/admin/van/drivers` for the last 30 days | Van page with that van's preview (`vehicle=`) |
| Liability | Page 1 of each scenario (`/api/admin/scenarios/:kind`) for the last 30 days | Liability, that scenario and record (`kind=`, `record=`) |
| Alert | Today's attention items (same data as the bell) | The job, or Alerts |
| Page / action | Static list (`DESTINATIONS` in `providers.ts`) | That page, view or modal (`?report=generate` opens Generate report) |

## Query handling

- Case, accents and spacing are ignored. Identifiers (job references, registrations,
  initials) are also compared without separators: `YC68VJZ`, `yc68 vjz` and `YC68` all
  find `YC68 VJZ`; `489F` finds `TMV-489FDAB633`.
- One character: drivers, vans and page names by prefix only, no server request.
  Two or more: server providers too.
- Multi-word queries need every word to match some field ("RM18 Tiago").
- A named driver becomes the jobs driver filter ("Tiago 489F"); a date becomes that
  London day ("Alex 13 Oct", "13/10", "2026-10-13", "yesterday"); a spaced UK postcode
  stays one term. The most selective remaining term is sent as `q`, the rest are
  checked against each returned job ("Alex SW1A 1AA").
- One typo (including a swapped pair) is tolerated in names of four letters or more.

## Ranking

Deterministic tiers, best first: exact identifier (1000), exact name (900), identifier
prefix (800), name prefix (700), whole word (680), word prefix (650), identifier
substring (450), name substring (350), typo (150). Keyword-only hits on pages are capped
at 350 so they never outrank a record. Ties: driver, job, van, customer, liability, page,
action, alert; then label. Results are deduplicated by type and id. When several types
match, the top three strong results are shown as "Best matches".

## Behaviour

- Local providers answer on every keystroke. Server providers wait for a 150 ms pause,
  pass an `AbortSignal` (React Query cancels superseded requests) and are cached
  (jobs 30 s, liability 2 min, vans 5 min). Results are only shown for the query they
  were requested for.
- A provider that fails is named in a notice; other results still show, and the empty
  message says "no matches in the sources that answered", never plain "no results".
- No matches: related destinations are offered under "Try one of these instead".
- Keyboard: arrows move, Enter opens, Tab reaches the scope chips, Esc closes and
  focus returns to the opener. Combobox/listbox semantics with `aria-activedescendant`.
- Phones: a full-screen sheet with safe-area padding. Desktop: a preview panel shows
  the facts already in the result (no extra requests).

## History and privacy

- Recently opened (localStorage): type, id, short label and destination, at most six.
  Jobs are stored by reference only; customers and alerts are never stored.
- Recent searches (sessionStorage): at most five, only when a result was opened, gone
  when the tab closes.
- Both are cleared on sign-out and session expiry, and by "Clear history". Nothing is
  sent anywhere; queries are not logged.

## Security

Every request goes through `adminFetch` with the admin session cookie; the backend
authorises each endpoint. Search adds no endpoint, never loads whole tables (one page per
provider) and stores no personal contact data.

## Performance

Ranking 3,000 driver records takes well under 250 ms in tests (`search.test.ts`). Each
server provider is one bounded request; durations are recorded per provider in
`useGlobalSearch` (`statuses[].ms`).

## Limits and backend proposal

- Liability and van matching cover the latest page per scenario / of vans in the last
  30 days, because those endpoints have no text search. Older records are reached from
  their pages.
- Job search is limited to what `/api/admin/jobs?q=` matches (job ID, customer, route).

A dedicated endpoint would remove these limits:

```
GET /api/admin/search?q=&types=job,driver,vehicle,liability&limit=8
-> { results: [{ type, id, label, detail, score }], partial: string[] }
```

Server-side: authorise as the other admin endpoints, parameterised queries only,
per-type limits, no regex built from raw input, and indexes on
`jobs(jobId)`, `jobs(customerNameNormalized)`, `jobs(pickupPostcode, dropoffPostcode)`,
`jobs(driverInitials, bookedStart)`, `vans(registrationCompact)` and
`scenarios(kind, clientNameNormalized, timestamp)`. Do not log full queries.
