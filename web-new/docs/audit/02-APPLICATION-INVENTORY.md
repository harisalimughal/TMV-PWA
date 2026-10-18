# 02. Application inventory

Stack (verified, `package.json`): Vite 6, React 18.3, TypeScript 5.7, Tailwind 3.4 with CSS-variable tokens,
TanStack Query 5, Luxon (Europe/London), Recharts 2.15, Leaflet 1.9, framer-motion 11, lucide-react, fflate
(report ZIP), vite-plugin-pwa (Workbox `generateSW`), Vitest 4 + Testing Library + jsdom. Node 20.19+/22.13+.
Not in this repo: backend (Express + MongoDB per `CLAUDE.md`), Google Chat bot, push sender, GPS tracker
integration (GPSLive per alert types), Make.com, Calendar extension, website booking form.

Source size: 597 TypeScript files, 166 test files. Largest: `JobWorkflowScreen.tsx` 1,555 lines,
`ScenarioFormScreen.tsx` 915, `VanScreen.tsx` 734, admin `LiveFleetMap.tsx` 706.

## Products

| Product | Location | Status |
| --- | --- | --- |
| Aurora admin | `src/screens/admin/` | Implemented; routed on the dashboard host and `/admin` on localhost |
| Driver PWA | `src/App.tsx`, `src/screens/`, `src/components/driver` | Implemented |
| Classic admin | `src/screens/admin-classic/` (17,321 lines) | Unrouted since `/temp` retired; code kept |
| Mock API | `src/mocks/` | Dev and demo only; tree-shaken from production builds |

## Admin modules (`navigation.ts`)

| Module | Route | Status | Notes |
| --- | --- | --- | --- |
| Overview | `?section=overview` | Implemented | KPIs, status mix, receipts and timing; date toolbar; metrics documented in `OVERVIEW_AUDIT.md`. Loads up to 30 pages x 100 jobs client-side (backend range aggregates missing). |
| Jobs | `jobs` | Implemented | Cards and table, filters in URL, bulk bar, add job (`POST /api/admin/jobs`), reassign, delete, centred job dialog (`?job=`), PDF report. |
| Activity | `activity` | Partial | UI complete; needs `/api/admin/activity/*` (Backend, proposed in `docs/ACTIVITY_CHAT_PHASE1.md`). Shows "not available" without it. |
| Live Fleet | `livefleet` | Implemented | Leaflet map, 10 s refresh, reverse geocoding via public Nominatim (plain fetch, third party). |
| Drivers | `drivers` | Implemented | Cards and table, Performance tab, per-driver report (six tabs), edit from card, add driver. |
| Van | `vehicles` | Implemented | Single view with warnings; compliance, fuel, mileage. |
| Liability | `evidence` | Implemented | Check-in/out, parking, liability records, centred document modal and PDFs. |
| Alerts and messages | `alerts` | Implemented | Needs attention, fleet events, delivery log; Broadcast Notice composer; Notify Driver target. |
| Settings | `settings` | Implemented | Pricing, templates, notifications. |
| Data maintenance | `maintenance` | Implemented | Not in the sidebar. |
| Payments, Bookings, Charges and reconciliation | none | **Planned** | Not built; listed in `CLAUDE.md`. |

## Driver app

Jobs list (Today/Upcoming, pending-details banner, office-messages banner), job workflow (arrival, loaded,
issues, extra charges, overtime, total, payment, empty van photo, signature, review), Liability and scenario
forms (offline outbox), Van (mileage, fuel, compliance), Settings, Pending submissions, Messages inbox and job
activity (UI only, needs backend), notification bell with on-device history (IndexedDB written by
`public/push-worker.js`). Login, forgot and reset password.

## Data flow (as far as the repository shows)

```
Website form -> Make.com (pricing) -> Calendar event (extension)        [not in repo; Unknown]
Calendar -> backend sync -> Job (READY)                                 [Backend]
Admin: POST /api/admin/jobs (booking -> Calendar event; job appears after sync)   [client verified]
Admin: reassign / finish-manually / review / evidence delete            [client verified]
Driver: /viewed, /on-my-way, /start, /actions {action,input}, /evidence, /signature, /driver-summary
Backend state machine -> job.currentState, activity[], timeBilling, charges
GPS tracker -> backend -> trackerArrivalAt, zone events (tunnel/congestion), alerts
Push: POST /api/push/admin/broadcast {title, body, url, driverInitials?} -> subscriptions -> push-worker.js
Payments: driver SUBMIT_PAYMENT + admin "recorded receipts"; no invoice payment records
```

Verified gaps in the chain: there is no admin Payments module, no invoice payment tracking, no
booking-to-job linkage visible in the UI beyond the Calendar sync, and no per-day status history.
