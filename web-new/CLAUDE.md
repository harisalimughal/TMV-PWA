# CLAUDE.md

Working brief for Claude Code in this repository. Read it fully before changing code.

## Project map (start here)

- **Owner:** Talha (GitHub `talhaazhar-ta`). This repo, `talhaazhar-ta/projectnewTMV` (private),
  is the only active codebase. Local path `D:\projectnewTMV`.
- **Three products, one build:**

  | Product | Folder | Design | Dev URL | Production |
  | --- | --- | --- | --- | --- |
  | Aurora admin | `src/screens/admin/` | the partner team's | `localhost:3001/admin` | `dashboard.themanvan.co.uk` (every path) |
  | Classic admin | `src/screens/admin-classic/` | Talha's | not routed (`/temp` redirects to `/`) | not routed |
  | Driver app (PWA) | `src/App.tsx`, `src/screens/`, `src/components/` | Talha's | `localhost:3001/` | the driver domain, path `/` |

- **History:** the partner's merged Aurora codebase arrived as a zip and became this repo. Talha's
  earlier repo `projectTMV` was retired after its driver app and admin were moved in here; its
  full history lives on branch `archive/projectTMV` (tag `my-design-v1`). Details and every
  merge decision: `docs/MERGE_REPORT.md`.
- **Status:** feature-complete for both admins and the driver app on the mock API. Deployment
  target and domains are **not decided yet**; `docs/DEPLOYMENT.md` has the build and nginx notes.
  A demo build (driver app and Aurora admin, fictional mock data, no backend, any password signs
  in) auto-deploys from `main` to `https://tmv.elevariq.tech` on Hostinger (`docs/DEPLOYMENT.md`,
  "Preview on Hostinger").
- **How Talha likes work done:** plain, direct writing with no em dashes; root cause before fixes;
  one meaningful commit per change; `npm run verify` before every commit; feature branch, PR,
  CI green, then merge to `main`. When he says "finalize" (or "commit, push, merge, deploy"),
  carry the change all the way: merge once CI passes and check the preview deploy. Always ask
  first before irreversible actions (deleting branches, folders or repos, force pushes).

## What this is

Frontend for **The Man Van (TMV)**, a UK removals company's job platform. One Vite + React 18 +
TypeScript app that ships three products from one build:

- **Admin dashboard** (`src/screens/admin/`): the "TMV Aurora" design. Served on
  `dashboard.themanvan.co.uk` (every path) and on `http://localhost:3001/admin` in dev.
- **Classic admin** (`src/screens/admin-classic/`): Talha's earlier admin design. Its code is kept
  but **not routed**: `/temp`, its old URL, redirects to `/` on every host (`src/lib/adminHost.ts`).
  Its mock data (`src/mocks/classicAdmin.ts`) is no longer installed. Do not import across
  `admin/` and `admin-classic/`.
- **Driver app** (`src/App.tsx`, `src/screens/`, `src/components/`): an installable, offline-capable
  PWA used by drivers on their phones during jobs.

The backend (Express + MongoDB, plus a Google Chat bot) lives in **other repositories**. This
app only calls same-origin `/api/...` endpoints with cookie sessions (`tmv_admin_session` for
the admin, a separate driver session). Never change a request or response shape here without
the matching backend change; treat existing contracts as fixed.

Stack: React Query (server state), Luxon (London time), Recharts (charts), Leaflet (live map),
Tailwind with CSS-variable tokens, vite-plugin-pwa (Workbox `generateSW`), Vitest + Testing Library.

## Commands

```bash
npm ci                 # install (Node 22, see .nvmrc)
npm run dev            # http://localhost:3001 (driver) and http://localhost:3001/admin (admin)
npm run verify         # typecheck + all tests + build + precache check. Run before every commit.
npm run test -- <path> # watch one test file
```

Dev uses the in-repo mock API (`src/mocks/`) unless `.env.local` sets `VITE_MOCK_API=false`
(then `/api` is proxied to `BACKEND_TARGET`). Open the admin on `localhost`, not `127.0.0.1`:
`App.tsx` only mounts the admin on `localhost` or the dashboard domain.

## Rules that are easy to break

### 1. PWA precache rule (admin code must stay out of the driver's offline cache)
Drivers' phones precache the app for offline use; the dashboard must not be in that cache.
- The admin enters the bundle through **one** dynamic import in `src/App.tsx`
  (`src/screens/admin/AdminApp.tsx`; the classic admin is not routed, so it is not in the build).
  Keep it that way: never import admin modules statically from driver code. `ui/viz` is imported directly by
  the classic admin and is deliberately not re-exported from `ui/index.ts`.
- `scripts/adminChunks.ts` (a Vite plugin) walks the chunk graph at build time: everything
  reachable only through the AdminApp chunk is admin-only, and Workbox's `manifestTransforms`
  in `vite.config.ts` drops it from the precache. Code-splitting admin pages is therefore safe.
- `npm run check:precache` (part of `verify` and CI) fails unless it finds exactly one AdminApp chunk,
  and if an admin-only file is precached,
  if a driver file is missing from the precache (offline would break), or if the precache
  exceeds its budget (2400 KiB; about 2067 KiB today). A Vite warning that the AdminApp chunk
  is over 500 kB is expected.

### 2. Dialogs and overlays
- Use `Modal` (`src/ui/Modal.tsx`) or `Drawer` (`src/screens/admin/dashboard/components/ds/Drawer.tsx`).
- A custom full-screen overlay must render with `createPortal(..., document.body)` **and** call
  `useDialogFocus(open, ref, onClose)` (`src/ui/useDialogFocus.ts`). The hook keeps one stack
  for all dialogs: only the top one handles Escape and Tab, and focus returns to the opener.
- Never render a `fixed` overlay inline inside the admin `Layout`: its content column is
  `relative z-10`, so the overlay ends up underneath body-level drawers.
- Printing: report printing uses `PrintPortal` plus the `@media print` rules in
  `src/index.css`. On-screen previews must be `print:hidden`. Printable documents
  (`.report-document`, `#tmv-print-portal`) always use the light palette, even in Midnight
  (see the top of `adminTheme.css`); keep new printable components inside `.report-document`.

### 3. Data honesty (no fabrication)
- Missing data is shown as missing ("Not recorded", `<Missing />`), never as `0` or `£0.00`.
- Totals with missing values are "known" subtotals with a coverage note. Period comparisons are
  shown only when both periods loaded completely.
- Do not invent metrics the backend does not provide (availability, on-time %, payment status
  of invoices, and so on). See "Not built" below.
- Metric definitions for the overview live in `dashboard/utils/overviewData.ts` and are
  documented in `docs/redesign-handoff.md`. Change them only together with their tests.

### 4. Money, time and labels
- API money is mostly **pence** (`amountCharged`, `finance.*Pence`); format with the helpers in
  `dashboard/utils/format.ts`. "Final charges" are billed amounts (include invoices), not money
  received; "Recorded receipts", "Unpaid invoices" and "Driver-reported" are separate measures.
- All reporting days and times are **Europe/London** (Luxon). Display dates like `13 Oct 2026`,
  24-hour times, and say "London time" where a scope is shown.

### 5. Admin theme
- Two themes: **Aurora Light** (default) and **Midnight Aurora**, defined in
  `dashboard/adminTheme.css` under `html.tmv-admin` and `html.tmv-admin[data-admin-theme="dark"]`.
  Aurora Light is a **neutral** white-on-off-white theme: canvas `#F8F9FB`, cards, sidebar and
  header `#FFFFFF`, lines `#E7E9EE`/`#DCDFE4`, one violet accent (`#6D28D9` text, `#7C3AED` fills)
  shared with Midnight; the guard caps the light surfaces' tint so lavender cannot return.
  Midnight is **true black**: canvas `#000`, cards `#0A0A0A`, then `#111` and `#171717` for
  menus and hover, lines `#242424`/`#333`. Every neutral token is pure grey (R = G = B); no
  navy or slate. `adminTheme.test.ts` enforces that, plus AA contrast and a ban on navy hex
  values in admin source. Sidebar, nav and card chrome are tokens (`--sidebar-*`, `--nav-*`,
  `--gloss-*`), so restyle them there, not in components.
  `AdminApp` adds the class while mounted; `useAdminTheme` stores `light | dark | system` in
  `localStorage` (`tmv:admin-theme`).
- Use the admin tokens (`admin-ink`, `admin-ink-2`, `admin-line`, `admin-brand`, `.tmv-panel`,
  `.tmv-gloss`, `CHART.*` colours). Do not set `data-theme` on wrappers inside the admin (it masks
  the admin palette). Every status keeps a text label; colour is never the only signal.
- The driver app has its own tokens (`src/styles/tokens.css`) and light/dark handling
  (`src/ui/theme.tsx`). Admin restyling must not leak into it.
- The reverse holds too: driver behaviour that acts on the whole document must stand down on
  the admin. `src/styles/chrome.css` is scoped with `:where(html:not(.tmv-admin))`;
  `ThemedTooltips` and `keepFocusedFieldVisible` check `isAdminDocument()` (`src/lib/adminHost.ts`).
  Do the same for anything new of that kind. The driver design comes from the `projectTMV`
  redesign; see `docs/MERGE_REPORT.md`.

### 6. Routing and URL state
- Admin routes are `?section=` values (`dashboard/navigation.ts`: 8 destinations plus
  `driverreport` and `maintenance`). Legacy names are rewritten to canonical ones; keep that
  mapping when renaming anything. A job opens as a drawer over any page via `?job=`.
- Page filters live in the URL (`hooks/useUrlState.ts`) so Back/Forward and reloads restore them.
- Unsaved edits register with `utils/unsavedChanges.ts` so navigation asks before discarding.

### 7. Admin requests
Admin API calls go through `adminFetch` (`src/lib/adminTransport.ts`): same-origin cookies,
30 s timeout (pass a longer one for slow operations, as `factoryReset` does), calm message for
5xx/offline, and a `401` fires the session-expired event that returns the user to sign-in and
clears cached data. Every admin backend call in both admins uses it (report downloads pass a
2 minute timeout). The only plain `fetch` left is the Live fleet map's reverse geocoding, which
calls the public Nominatim service, not our backend. Use `adminFetch` for anything new.

### 8. Mock API
`src/mocks/` is tree-shaken out of production builds (`main.tsx` guards it with
`import.meta.env.DEV`), except the preview demo build, which sets `VITE_DEMO_MOCK=true`. Unknown endpoints return `501` in the mock instead of reaching a real
backend. When you add an admin endpoint call, add a mock handler in `src/mocks/admin.ts` with
fictional data so the screen can be previewed.

## Engineering principles (from the project owner)

- **Root cause before fixes.** Confirm the diagnosis before changing code; no speculative patches.
- **Work from the current code.** Re-read files before editing; patches made against a stale
  copy have caused regressions before.
- **Correctness over convenience.** If something cannot be done properly yet, document it openly
  instead of faking it.
- **Every behaviour change gets a test** (colocated `*.test.ts(x)`), and `npm run verify` passes
  before a commit.
- Writing style for docs, commit messages and replies: plain and direct, no em dashes.

## Verifying UI changes

1. `npm run dev`, open http://localhost:3001/admin (mock data). For driver changes open
   http://localhost:3001/ as well (signed in as the mock driver, at 390 px and desktop).
2. Check light and midnight themes (header switch) at 1440, 1024, 768 and 390 px wide.
3. No page-wide horizontal scroll, no console errors, keyboard focus visible and trapped in dialogs.
4. Reference screenshots of the intended look: `docs/aurora-screenshots/`.

## Known gaps and backlog

Not built (no screen or no data yet): Bookings, Payments, Charges & reconciliation (they join
`NAV_GROUPS` in `navigation.ts` when built); driver availability; on-time %; invoice payment
tracking; a "Critical" severity (the model has High/Medium/Low).

Backend requirements still open (details in `docs/redesign-handoff.md`): per-day status history,
server-side range aggregates (the overview loads up to 30 pages of 100 jobs), a documented revenue
definition, missing-submission counts on the jobs list, invoice payment records, full vehicle
attention counts.

UI follow-ups: screen-reader and forced-colours passes not done; driver report and Liability sub-pages not
individually reviewed in Midnight. History of how this code was assembled: `docs/MERGE_REPORT.md`.

## Git

- `main` is the deployable branch. Work on a feature branch, open a PR, and let CI
  (`.github/workflows/ci.yml`, runs `npm run verify`) pass before merging.
- Never commit `.env.local`, credentials, `dist/` or `node_modules/`.
- Line endings are LF (`.gitattributes`).
