# 09. Verified issues register and improvement backlog

"Verified" = seen in this repository's code or tooling. "Backend" = must be confirmed or fixed elsewhere.
Complexity and regression risk: L low, M medium, H high.

## Status after the audit

Fixed in the same pull request as this audit (tests included):
- **F-01** notification URLs: `src/lib/safeUrl.ts` and a tested copy in `public/push-worker.js`; used by `NotificationBell` and `InAppNotificationListener`. Server-side validation (B-03) is still open.
- **F-02** Activity polling: the unread, conversations and driver inbox polls stop once the server answers 404/501 (driver inbox retries at most every 10 minutes).
- **F-21** (new, found during that work) "More" menus clipped by `overflow: hidden` parents (job dialog footer, job cards): `src/ui/Menu.tsx` now renders in a portal with viewport collision handling (`src/ui/menuPosition.ts`), skips disabled items, and lets Escape close only the menu.
- **F-22** (new) demo Activity data depended on the London time of day and failed CI after midnight: fixed, with a regression test at six clock times.

## Verified issues register

| ID | Module | Issue | Evidence | Sev | Impact | Fix | Cx |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | Driver notifications | Tap destination navigated to without same-origin check | `public/push-worker.js:144-166`, `NotificationBell.tsx:87`, `InAppNotificationListener.tsx:95` | Medium | Phishing redirect if a sender is compromised or buggy | `safeInternalUrl()` shared helper, worker copy, server-side check | L |
| F-02 | Activity | Unread badge polls forever when endpoint missing | `hooks/useActivity.ts:22-31` | Medium | Wasted requests every 30 s per admin session; noise in server logs | Stop on 404/501, back off | L |
| F-03 | Driver workflow | No request id on `sendAction` | `src/api/jobs.ts:325-331` | Medium (Backend) | Duplicate completion relies on server state only | Send `clientRequestId`; server dedupes | M |
| F-04 | Repo | 17,321 unrouted lines (classic admin) | `src/screens/admin-classic` | Low | Build, test and review cost; two live-fleet maps | Archive to a branch/tag, delete from `main` (needs owner approval) | M |
| F-05 | Repo | No linter; 63 `any` | no ESLint config; grep | Low | Unused code, hook-rule and `any` drift undetected | Add ESLint (react-hooks, no-explicit-any as warn), fix incrementally | M |
| F-06 | Deploy | No security headers in repo config | `deploy/hostinger/.htaccess` | Low (prod Unknown) | Clickjacking, weak referrer policy | Add headers in nginx and preview; CSP report-only first | L |
| F-07 | Dependencies | 8 advisories (5 high build-time, 3 moderate); `fflate` prod advisory not reachable | `npm audit` | Low | Supply-chain hygiene | `npm audit fix` for fflate; audit step in CI | L |
| F-08 | Transport | Plain `fetch` outside shared transports | `usePushNotifications.ts:49,79,96,127`, `outbox.ts:140` | Low | No timeout or 401 handling on those calls | Use `request` | L |
| F-09 | Driver app | 1,555-line workflow component | `JobWorkflowScreen.tsx` | Low | Regression risk on workflow changes | Extract per-step components behind existing tests | H |
| F-10 | Overview | Client-side aggregation of up to 3,000 jobs | `useRangeJobs.ts` | Medium (Backend) | Slow on long ranges | Server range aggregates | H |
| F-11 | PWA | 1 MB of logo and icon in driver precache | build log: `tmv-logo.png` 613 KiB, `icon-512.png` 402 KiB | Low | Slower first install | Optimise images | L |
| F-12 | Driver report | Charge windows and scheme names hard-coded as display text | `report/RoadChargesTab.tsx:24-25` | Low | UI may drift from backend rules | Serve from settings; show rule version | M |
| F-13 | Data | Pence in some endpoints, pounds in others | `types.ts` (`amountCharged` pence) vs drivers summary `revenuePounds` | Medium (Backend) | Unit confusion risk | One unit in the API, conversion at presentation | M |
| F-14 | Accessibility | No automated a11y tests or recorded screen-reader pass | `package.json` | Low | Regressions invisible | Add axe checks in component tests; manual NVDA/VoiceOver pass | M |
| F-15 | Overview | KPI tiles do not link to filtered records | tile components | Low | Extra clicks | Click-through to Jobs with filters | L |
| F-16 | UI | Native selects mixed with design-system controls | Activity filters, composer | Low | Visual inconsistency | `Select` primitive | L |
| F-17 | QA | No end-to-end tests | no Playwright/Cypress in repo | Low | Cross-module flows rely on unit tests | Add Playwright against the mock build | M |
| F-18 | State | `staleTime: 0` for admin pages | `main.tsx:27-34` | Low | Extra requests on every focus | Admin client with short staleTime | L |
| F-19 | Notifications | Driver notification history is on-device only | `push-worker.js` IndexedDB | Low (design) | Admin cannot see what a driver received; history lost on reinstall | Server-side notification records (Backend) | H |
| F-21 | Shared Menu | Menu list rendered inline (`absolute top-full`) and clipped by `overflow: hidden` ancestors (`ds/Dialog.tsx:46`, `.tmv-job-card`) | `src/ui/Menu.tsx` before the fix; reproduced in the browser | Medium | Menu invisible or cut off at the bottom of the job dialog | Portal + collision placement (done) | M |
| F-22 | Mock data | Activity demo data and tests depended on London time of day | CI failure at 23:31 UTC | Low | Flaky CI, empty demo overnight | Relative windows (done) | L |
| F-20 | Payments | No booking-job-charge-payment trace | no Payments module | n/a Planned | Reconciliation by hand | Phase 2 | H |

## Prioritised backlog

| ID | Pri | Module | Recommendation | Approach | Depends | Cx | Risk | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-01 | P1 | Push | Make notification URLs same-origin only | Shared helper; use in worker and both components; tests with `https://evil`, `//evil`, `javascript:` | none | L | L | External URLs open `/` instead; existing taps still work |
| B-02 | P1 | Activity | Stop polling when unavailable | Query `enabled` flag from first 404/501; retry on focus once per 10 min | none | L | L | Mock 501 test shows one request, not a loop |
| B-03 | P1 | Backend | Server-side validation of broadcast recipients and destination | Reject unknown `driverInitials`, non-app URLs | Backend | M | L | 400 for each invalid input |
| B-04 | P1 | Driver actions | Add request ids and idempotent handlers | `clientRequestId` in `sendAction`; unique index server-side | Backend | M | M | Replaying an action returns the original result |
| B-05 | P1 | Rules | Move time and charge rules into tested backend modules; document them | Table-driven tests incl. the 1h30/2h/2h30 examples, charge windows with London DST | Backend | M | M | Tests pass; UI reads rule version |
| B-06 | P2 | Security | Headers and CSP report-only | nginx + `.htaccess` | deploy access | L | L | Scan shows headers |
| B-07 | P2 | Repo | ESLint, `npm audit` in CI | flat config; CI step | none | M | L | CI fails on new errors; baseline recorded |
| B-08 | P2 | Repo | Retire classic admin | tag, delete, fix mocks | owner approval | M | M | Build and tests green; bundle unchanged |
| B-09 | P2 | PWA | Optimise logo and icons | SVG/WebP | none | L | L | Precache under 1.6 MB |
| B-10 | P2 | Overview | Click-through KPIs; backend aggregates | URL filters; endpoint | Backend | M | L | Click opens filtered Jobs |
| B-11 | P2 | A11y | axe in tests; screen reader pass | `vitest-axe` on key screens | none | M | L | Zero serious violations |
| B-12 | P2 | Driver app | Split `JobWorkflowScreen` | Extract steps one at a time | tests exist | H | H | Same tests pass unchanged |
| B-13 | P2 | Notifications | Server-side notification log and delivery states (accepted, delivered, opened) | Backend records; admin history view | Backend | H | M | Admin sees per-driver history; states never conflated |
| B-14 | P3 | UI | `Select`, stat tile, modal header primitives | `ds/` | none | L | L | No native select in toolbars |
| B-15 | P3 | QA | Playwright smoke suite | mock build; 10 flows | none | M | L | Runs in CI |
| B-16 | P3 | Phase 2 | Payments and internal booking | see roadmap | Backend design | H | M | per roadmap |
