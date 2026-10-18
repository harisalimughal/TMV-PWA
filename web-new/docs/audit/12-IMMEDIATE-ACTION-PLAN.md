# 12. Immediate action plan

## Top ten

| # | Change | Why | Files | Preserve | Safe approach | Verify |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Same-origin-only notification URLs | F-01 | `public/push-worker.js`, `NotificationBell.tsx`, `InAppNotificationListener.tsx`, new `lib/safeUrl.ts` | existing deep links (`/?tab=...`) | helper + table tests | tests for hostile URLs; tap a demo notification |
| 2 | Stop Activity polling when unavailable | F-02 | `hooks/useActivity.ts`, Layout badge | works against the mock | `enabled` flag set on 404/501 | hook test with 501 shows one request |
| 3 | Backend: validate broadcast recipients and URL | F-01, B-03 | backend repo | existing broadcast | reject unknown initials and external URLs | API tests |
| 4 | Backend: request ids on actions | F-03 | `api/jobs.ts` + backend | workflow | optional header first, enforce later | replay test |
| 5 | Document and test billing and charge rules | B-05 | backend | all current totals | golden tests from real examples | rule tests incl. DST |
| 6 | Security headers | F-06 | nginx, `deploy/hostinger/.htaccess` | caching rules | report-only CSP | header scan |
| 7 | ESLint and CI `npm audit` | F-05, F-07 | config, `ci.yml` | existing code | warn first, baseline | CI |
| 8 | Optimise logo/icons | F-11 | `public/` | install icon quality | convert, compare | precache size |
| 9 | KPI click-through | F-15 | Overview tiles | existing metrics | URL filters only | click tests |
| 10 | Retire classic admin (with approval) | F-04 | `src/screens/admin-classic`, mocks | `archive/projectTMV` history | tag then delete | verify green |

## Best starting point

Items 1 and 2: both are small, local, fully testable in this repository, and remove the only two verified,
exploitable-or-wasteful behaviours found. Item 3 and 4 need the backend repository and should be scheduled next.

## What was and was not examined

Examined: all frontend source structure and key files (transport, workflow, notifications, activity, cards,
reports, navigation, theme tests, build and deploy config), dependency advisories, and the full local verify.
Not examined: backend, database, production server and secrets, Make.com, the Calendar extension, website
booking form, GPS provider, real push delivery, real devices, screen readers, load behaviour. Findings about those
areas are marked Unknown or Backend and are not claimed.
