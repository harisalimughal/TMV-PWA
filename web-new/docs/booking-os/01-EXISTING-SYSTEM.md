# Booking OS 01: existing system audit

Read from the repository on `main` (merge `c2cebac`). *Verified* means a file was read; *external* means the
code is not in this repository and nothing is assumed about it. Companion documents: `00-FRAMEWORK.md`
(rules and stages), `02-TARGET-ARCHITECTURE.md`, `03-DELIVERY-PLAN.md`, and the earlier application audit in
`docs/audit/` (which this does not repeat).

## 1. Dashboard architecture

| # | Topic | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | Framework and dependencies | Vite 6, React 18.3, TypeScript 5.7 strict, Tailwind 3.4, TanStack Query 5, Luxon, Recharts, Leaflet, framer-motion, lucide-react, fflate. No Redux, Zustand, router library, form library or date-picker library. | `package.json` |
| 2 | Component structure | `src/ui/` shared primitives (Modal, Menu, Button, Field, Select, Skeleton, ...). Admin: `src/screens/admin/dashboard/{pages,components,components/ds,hooks,utils,reports,search}`. `components/ds` is the admin design system (Action, Badge, Notice, Section, Metric, Table, Toolbar, Tabs, Dialog, Drawer, SaveBar, Charts, ExportMenu). Driver app in `src/screens`, `src/components`. Classic admin kept, unrouted. | `src/` tree |
| 3 | Routing and navigation | No router library. `?section=` values resolved in `navigation.ts` (`NAV`, `resolveRoute`), legacy names rewritten, `?job=` opens a centred job dialog over any page. Page filters live in the URL via `hooks/useUrlState.ts`. Sidebar groups: Operations, Fleet management, Communication, System. `NAV_GROUPS` reserves the place for Bookings, Payments and Charges. | `navigation.ts`, `Layout.tsx` |
| 4 | State management | Server state: TanStack Query (default `staleTime: 0`, `retry: 1`, refetch on focus). URL state for filters. Local `useState` for UI. Unsaved edits register in `utils/unsavedChanges.ts`. Theme in `localStorage` (`tmv:admin-theme`). No global client store. | `main.tsx`, hooks |
| 5 | API communication | Admin: `adminFetch` (`src/lib/adminTransport.ts`): same-origin cookies, 30 s timeout (longer when asked), calm message for 5xx and offline, a 401 fires the session-expired event. `src/lib/http.ts` for the driver app (`request`, `postJson`, offline outbox). Errors read `{ error: { message } }`. Lists are `{ items, pagination: { page, pageSize, total, totalPages, hasMore } }`. | `adminTransport.ts`, `api.ts`, mocks |
| 6 | Authentication | Admin cookie session `tmv_admin_session` (`/api/admin/login`, `/logout`, `/me`); driver session separate (`/api/auth/*`). Admin shows sign-in when `/me` fails. | `api/admin.ts`, `auth.ts` |
| 7 | Authorisation | **No role or permission is visible to the client.** Driver records have a free `role` string (default "Driver"). Whether admins differ in what they may do (price, assign, delete) is decided by the backend and unknown here. The delete and factory-reset actions exist in the UI without a client-side role gate. | `api/admin.ts`, `MaintenancePage.tsx` |
| 8 | Data fetching | Query hooks per page. Overview loads up to 30 pages of 100 jobs client-side (no server aggregates). Generate Report loads drivers three at a time. Drivers roster cached one hour (`useDriverOptions`). | `useRangeJobs.ts`, `reports/` |
| 9 | Caching | React Query in memory only. The service worker precaches the **driver** app shell; admin code is excluded by the precache guard and nothing admin is cached offline. | `vite.config.ts`, `scripts/adminChunks.ts` |
| 10 | Real-time | **Polling only**; there is no WebSocket, SSE or socket library in the source. Intervals: live fleet 10 s, attention 30 to 120 s, alerts 30 s, activity conversations and unread (stop when the endpoint is unavailable). | `rg refetchInterval` |
| 11 | Notification infrastructure | Web Push (VAPID: `/api/push/vapid-public-key`, `/subscribe`, `/unsubscribe`), `public/push-worker.js` with a safe-URL guard, on-device history in IndexedDB, in-app listener and bell, admin Alerts and messages (needs attention, fleet events, delivery log), `POST /api/push/admin/broadcast {title, body, url, driverInitials?}`. SMS to customers via Firetext (key and sender in Settings; sender code external). | `src/components`, `AlertsCenterPage.tsx` |
| 12 | Reusable UI | See item 2. Menus portal and flip (`ui/Menu`), dialogs trap focus in a stack (`ui/useDialogFocus`), `Modal` sizes sm to `3xl`, `DateRangePicker` (presets plus native date inputs), `Table`, `Toolbar` segmented controls, `Charts`, Skeleton, EmptyState/ErrorState/LoadingState. | `src/ui`, `ds/` |
| 13 | Design tokens | Admin tokens in `adminTheme.css` under `html.tmv-admin` (Aurora Light neutral, Midnight true black), Tailwind aliases (`admin-ink`, `admin-line`, `admin-brand`, `admin-status-*`). Driver tokens in `src/styles/tokens.css`. Fonts: Hanken Grotesk Variable and IBM Plex Mono via fontsource (Inter is installed as a fallback; Geist is **not** installed). `adminTheme.test.ts` guards neutrality, contrast, true black and bans navy hex in admin source. | `index.css`, `adminTheme.test.ts` |
| 14 | Testing | Vitest 4 + jsdom + Testing Library, tests beside code, CI `verify` = typecheck, tests, build, precache check (175 files, 1,321 tests at last run). No ESLint or Prettier config, no e2e suite. Playwright and axe-core are used ad hoc for screenshots and a11y checks, not wired into CI. | `vitest.config.ts`, `ci.yml` |

## 2. Operational modules

Evidence for items below is the client contract (types, endpoints, mocks, UI) because the backend is external.

### Jobs

| Topic | Finding |
| --- | --- |
| Creation | No job is created in the browser. Calendar events become Jobs through the backend sync. The only creation path in the UI is `AddJobModal`: `POST /api/admin/jobs` `{customerName, customerEmail?, customerPhone?, pickup, dropoff, crewSize, price (pounds), paidOnline, driverInitials?, start, finish}`, described in code as creating a real Calendar event, with the job appearing after sync. The form says only confirmed (`paidOnline`) bookings synchronise. Retrying after a dropped connection can duplicate it (the modal warns about this). |
| Identifiers | `jobId` ("TMV-" plus hex, backend generated), `calendarEventId` (join to Calendar). Stable across reassignment. |
| Details | `Job` and `NormalizedJob` (`src/api/jobs.ts`, `dashboard/types.ts`): customer, addresses (+ optional coordinates), crew, `basePrice` (pounds), `paidOnline`, booked and actual times, tracker arrival, time billing, charges, payment breakdown, evidence, scenarios, activity, review. Booking text fields parsed from the Calendar event: `rawTitle` (for example `2 Men - £170 - 16:00`), `rawDescription`, `floorFrom/To`, `vanSize`, `hireDurationText`, `inventory`, `extraRequest`, `extraChargeText`, `stopBy`. |
| Statuses | `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` (`status`), plus a finer `currentState` driven by the driver workflow. Payment status separate (`paymentStatus`). |
| Assignment | Job holds `driverInitials`; `POST /api/admin/jobs/:id/reassign {driverInitials}` and a bulk reassign in the UI. No assignment history is exposed, only the job's `activity[]`. No vehicle field on the job: the van is implied by the driver's `vanRegistration`. |
| Updates | Driver actions `POST /api/jobs/:id/actions`, evidence, signature, `viewed`, `on-my-way`, `start`; admin `review`, `finish-manually`, evidence delete. |
| Cancellation | Status `CANCELLED` exists; **no cancel endpoint is called by the dashboard** (jobs vanish or change via Calendar). Deletion exists (`DELETE /api/admin/jobs/:id`, with a bulk delete dialog); a code comment says reassign and delete involve Calendar permission steps. Whether delete cancels, archives or removes the Calendar event is external. |
| Completion | Driver submits payment, signature and review; summary via `/api/jobs/:id/driver-summary`; admin can finish manually with a note. |
| Reporting | Jobs CSV `/api/admin/jobs/export.csv`, per-job PDF, driver reports, Generate Report (`docs/REPORTING.md`). |

### Drivers

| Topic | Finding |
| --- | --- |
| Profile | `AdminDriver {email, initials, fullName, phone, vanRegistration, role, active, hasPassword, lastLoginAt}` plus `imei` for the tracker. CRUD under `/api/admin/drivers`. |
| Identifier | `initials` is the key everywhere (jobs, reports, notifications). Unique-ness is a backend rule (`UNASSIGNED` is a placeholder). |
| Availability | **None.** No shifts, leave, working hours or availability field. Only "has a job in this window" can be derived. |
| Assignments | Via the job's `driverInitials` and reassign. |
| Activity | Job `activity[]`, driver messages inbox, the proposed Activity contract (`docs/ACTIVITY_CHAT_PHASE1.md`). |
| Roles | `role` free string; no permission model. |

### Vans

| Topic | Finding |
| --- | --- |
| Records | `VanRecord` (MILEAGE, FUEL, SERVICE submitted by drivers with photos) and `VanCompliance` per registration (road tax, MOT, insurance dates, service interval, mileage). `/api/admin/van/*`. |
| Categories | **None.** Jobs carry free text `vanSize`; drivers carry one `vanRegistration`. No vehicle category, capacity or crew-size model. |
| Assignment | Implicit through the driver. No vehicle schedule. |
| Maintenance and availability | Compliance dates and service interval warnings exist; no "off road" status or vehicle schedule. |

### Tracker (Live Fleet)

`GET /api/admin/fleet/live` returns vehicles `{imei, name, plateNumber, lat, lng, speedMph, lastUpdate, driverInitials, driverName, odometerMiles, ignitionOn, ...}`; polled every 10 s. Driver mapping is `imei` to driver (driver record) with `driverInitials` supplied by the backend. Congestion and tunnel zone events (`/api/admin/fleet/congestion*`) and per-job charge evidence come from the GPS provider (GPSLive, external; webhook token in Settings). Location is stale when `lastUpdate` is old (the map labels it). Reverse geocoding uses the public Nominatim service from the browser.

### Activity

Per-job `activity[]` (free-text actions with timestamps and actor), the Alerts and messages module (attention, fleet events, delivery log), and the Activity workspace (UI complete, backend contract proposed and unavailable in production). Booking events should join the proposed typed event catalogue in `src/lib/activity/events.ts` rather than a new log.

### Payments

No Payments module and no payment ledger. Money appears as: driver-entered final charge (`amountCharged`, pence), `paymentBreakdown` (Cash, Card, Link, Bank Transfer, Invoice), "recorded receipts", unpaid invoices (amount left to invoice, no later tracking), manual driver submissions, extra charges. Definitions and the known gaps (no invoice payment records, mixed pence and pounds) are in `docs/audit-implementation.md` and `docs/REPORTING.md`. Whether "paid online" is tied to a provider is external.

## 3. External dependencies

| Component | In this repository? | What is known | Status |
| --- | --- | --- | --- |
| Backend API (Express, MongoDB) | No | Endpoints and shapes only through client calls and mocks | **External** |
| Google Calendar | No (only parsed fields and comments) | Events are the source of Jobs; `calendarEventId`; title and description carry booking fields | **External** |
| Calendar browser extension | No | Named in the brief; not referenced in code | **External, unknown** |
| Make.com scenarios | No | Mentioned in audit docs only; pricing maths unknown | **External, unknown** |
| Website booking form | No | Field list from the brief only | **External, unknown** |
| Driver sync scripts | No | Calendar to backend to `/api/jobs/list` per driver | **External** |
| Pricing calculation | **Partly**: rates in Settings, time billing results on jobs | Original quote maths unknown | **Unknown** |
| GPSLive | No | Webhook token and API key settings, alert types | **External** |
| Push sender, Firetext SMS | No | Settings keys, endpoints | **External** |
| Driver app | **Yes** (this repository) | Job list, workflow, scenarios, outbox, GPS-related timestamps from tracker | In scope |

## 4. Consequences for Booking OS

1. Everything customer-facing or money-computing that Make.com does today is unknown and is gated on exports.
2. The dashboard can be built and previewed against a typed contract and fictional data, but **every number shown
   in live mode must come from endpoints that do not exist yet**; until they do the UI shows "not available".
3. Today's job record already contains most booking attributes as text; a structured booking must map to those
   fields so the driver app and reports keep working unchanged during migration.
4. No availability, vehicle or role data exists: those features start as "unknown", never as guesses.
