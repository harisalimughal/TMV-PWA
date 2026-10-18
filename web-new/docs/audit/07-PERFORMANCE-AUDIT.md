# 07. Performance assessment

Measured means taken from this repository's build on 16 Oct (`npm run verify`, commit after PR 34). Everything
else is marked predicted. No runtime profiling on real devices or production data was done.

## Measured

| Item | Value |
| --- | --- |
| Driver entry chunk `index-*.js` | 571 KB raw, 168 KB gzip |
| Admin chunk `AdminApp-*.js` | 1,266 KB raw, 350 KB gzip (single dynamic import; Vite warns >500 KB, expected) |
| PWA precache | 15 files, 2,171 KiB of a 2,400 KiB budget (guard fails the build above it). Heaviest: `tmv-logo.png` 613 KiB, `index` 558 KiB, `icon-512.png` 402 KiB |
| Test suite | 1,162 tests pass; the full run takes about 1.5 to 2 minutes locally |

## Findings (evidence in code, effect predicted unless stated)

| ID | Priority | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| P1 | P2 | `tmv-logo.png` (613 KiB) and `icon-512.png` (402 KiB) are 47 percent of the driver precache. Measured sizes; effect on first install on mobile data is predicted. | build log | Re-encode logo as SVG or optimised PNG/WebP; keep 512 icon but optimise. |
| P2 | P2 | Admin chunk is monolithic (350 KB gzip). Admin-only, so it does not affect drivers (measured by the precache guard), but first dashboard load is predicted slow on weak links. | `scripts/adminChunks.ts`, build log | Split heavy admin-only features (Recharts reports, PDF/report builders, Leaflet) with route-level `import()`; the precache guard already tolerates it. |
| P3 | P1 | `useActivityUnread` and the nav badge poll every 30 s for every admin session and never stop when the endpoint is missing (404/501). Verified by reading the hook; the request load is predicted. | `hooks/useActivity.ts:22-31` | Disable the query after an "unavailable" response; back off. |
| P4 | P2 | Overview downloads up to 30 pages x 100 jobs per range and computes metrics in the browser. | `hooks/useRangeJobs.ts`, `CLAUDE.md` | Backend range aggregates (already listed as open backend work). |
| P5 | P3 | `staleTime: 0` with `refetchOnWindowFocus: true` refetches every active query on each focus. Deliberate (driver trust) but costly for admin pages with many queries (`useAttention` runs four). | `src/main.tsx:27-34`, `useAttention.ts:187-196` | Admin-specific client with a short `staleTime` (10 to 30 s). |
| P6 | P3 | Live Fleet polls every 10 s plus a second query every 5 min and reverse-geocodes via the public Nominatim service (rate-limited by its policy). | `LiveFleetMap.tsx:149,156` | Cache geocodes by rounded coordinate; move geocoding server-side. |
| P7 | P3 | Two copies of heavy map components exist (new and classic). Classic is unrouted. | `admin-classic/.../LiveFleetMap.tsx` | Remove with the classic admin. |

## Not measured (needs tooling or real data)

Lighthouse/Web Vitals, memory over long sessions, render counts of large tables, behaviour with thousands of jobs,
server response times, slow queries (database not available), image upload throughput.
