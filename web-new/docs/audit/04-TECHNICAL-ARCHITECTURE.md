# 04. Technical architecture

## Current architecture (verified)

```
Browser (one Vite bundle)
  driver domain  -> src/App.tsx -> driver screens (precached, offline capable)
  dashboard host -> lazy import AdminApp (single dynamic import; admin chunk excluded from precache)
  /api/* same-origin, cookie sessions (tmv_admin_session; separate driver session)
     admin: adminFetch (30 s timeout, 401 -> session-expired event)
     driver: lib/http.ts request/postJson (20 s, 120 s uploads, 401 -> login)
Server state: TanStack Query (staleTime 0, refetch on focus, src/main.tsx:27-34)
URL state: useUrlState (filters), ?section= routing (navigation.ts)
Mock API: src/mocks (DEV or VITE_DEMO_MOCK), unknown endpoint -> 501
Deploy: GitHub Actions CI (typecheck, tests, build, precache guard); demo deploy over SSH to Hostinger
```

## Strengths

- Clear product separation and a mechanical guard for it (`scripts/adminChunks.ts`, `check-precache.mjs`).
- One transport per app with consistent error text; mock handlers for every admin endpoint, so screens are testable.
- Pure shared library (`src/lib/activity`) used by both apps without importing admin code.
- Domain rules centralised where the frontend owns them (`jobView.ts`, `overviewData.ts`, `navigation.ts`).

## Weaknesses

| ID | Finding | Evidence | Priority |
| --- | --- | --- | --- |
| T1 | Classic admin is dead weight | 17,321 lines, 47 test files, referenced outside itself only in comments (`adminHost.ts`) and by mock data (`mocks/adminRecords.ts`, `mocks/classicAdmin.ts`) | P2 |
| T2 | No linter | no `.eslintrc*`/`eslint.config.*`; `grep ': any'` = 63 outside tests and mocks | P2 |
| T3 | Plain `fetch` outside the transports | `usePushNotifications.ts:49,79,96,127`, `outbox.ts:140`, `admin-classic/api.ts:30`, Nominatim in the fleet map | P2 |
| T4 | Duplicate live-fleet map components | `admin/.../LiveFleetMap.tsx` (706) and `admin-classic/.../LiveFleetMap.tsx` (720) | P3 |
| T5 | Giant components | `JobWorkflowScreen.tsx` 1,555; `ScenarioFormScreen.tsx` 915; `VanScreen.tsx` 734 | P2 |
| T6 | Activity unread polls forever when unavailable | `hooks/useActivity.ts:22-31` | P1 |
| T7 | `sendAction` has no request id | `src/api/jobs.ts:325-331` | P1 (Backend) |
| T8 | Aggregation in the browser | Overview loads up to 30 pages x 100 jobs (`CLAUDE.md`, `useRangeJobs.ts`) | P2 |
| T9 | `api/` has no tests | `src/api` 0 test files (behaviour tested through screens and mocks) | P3 |

## State management

React Query for server state, URL for filters, local state for forms. `staleTime: 0` plus
`refetchOnWindowFocus` guarantees freshness at the cost of extra requests on every focus. Unsaved edits register
with `utils/unsavedChanges.ts`. No global client store; none needed.

## Realtime

Polling only: Live Fleet 10 s, attention sources 30 to 60 s, Jobs list 30 s on the driver, Activity 5 s open
conversation, 20 s list, 30 s unread. No WebSocket or SSE exists, so event ordering is by timestamps and cursors.
Misleading-state guard: the Activity thread shows "Reconnecting" after a failed poll; other pages show their last
data until the next successful fetch (**T10, P3**: add a visible "last updated" on every polled page).

## Deployment and maintainability

CI runs verify on every push and PR; the demo deploys from `main`. Missing from the repo (Unknown or
Backend): rollback procedure, health checks, error monitoring (only `ErrorBoundary`), logging, database
backups and restore tests, secrets management. `docs/DEPLOYMENT.md` documents the build and nginx notes.

## Testing (verified)

166 test files, 1162 tests passing. Strong: workflow screens, navigation, cards, mocks, calendar and date
logic, theme tokens. Weak or absent: end-to-end tests (none), accessibility tests (none), `src/api` (0),
timezone edge cases around clock changes (Luxon is used consistently; no DST-boundary test found), contract
tests against the real backend (impossible here).
