# Merge report: old web + New Dashboard UI 1 + New Dashboard UI 2

Date: 15 Oct 2026. Result: this repository (branch `main`).

## Inputs

| Archive | What it was |
| --- | --- |
| `old_web.zip` | The previous functional interface (the "web.zip" named in the git history). No git history. |
| `New_Dashboard_UI_1.zip` | The Aurora redesign: git branch `redesign/audit-implementation` at `f710bcb` (audit redesign, analytics overview, Aurora themes and shell, old-web logic port, motion pass). Clean working tree. |
| `New_Dashboard_UI_2.zip` | Exactly UI 1, plus an **uncommitted, unfinished** integration round on branch `integration/premium-functional-merge` (14 files changed, 5 added), plus Windows `node_modules`, `dist` and build/test logs. |

## What the comparison showed

- **UI 2 contains all of UI 1.** Same commits, same design. The only differences are the
  integration round's files.
- **The old web's logic was already carried over** in commit `d4a57b8` ("Port web.zip logic
  changes onto the Aurora UI"): hours-focused driver report, "Tracker Pick-up arrival" labels,
  driver hours form, report types and fixtures. Every other difference between the old web
  and the redesign's baseline was Windows line endings only.
- **API parity:** every endpoint the old UI calls is still called by the merged app. The old
  parking CSV export (`/api/admin/scenarios/parking/export.csv`) is covered by the generic
  scenario export on Liability & checks. The two calls no longer used (`fetchSummary`,
  `triggerDatasetRefresh`) were replaced on purpose: the overview computes from range jobs, and
  the old refresh was a no-op.
- **Driver app:** identical to the old web apart from the ported hours form and the shared
  modal changes.
- Old screens that no longer exist were folded into new ones by the redesign (see
  `docs/audit-implementation.md`, "Implementation notes"): Finished jobs became the Jobs
  "Completed" filter; Scenarios and Parking liability became Liability & checks; the submission
  drawer became the job drawer tabs.

## Commits added in this merge

1. `Integrate functional fixes onto the Aurora UI (UI 2 work in progress)`: UI 2's uncommitted
   round, committed exactly as delivered so it stays traceable: reachable job creation (Add job
   on Jobs), Scheduled/Cancelled status drill-downs from the overview, one shared dialog focus
   stack (`useDialogFocus`) for Modal and Drawer, `adminFetch` with timeouts and a session-expired
   flow, Live fleet map teardown fixes, and the dev mock no longer falling through to a live backend.
2. `Fix regressions found while merging the two new UIs`:
   - **Admin code was being downloaded by every driver phone.** UI 2 lazy-loaded each admin
     page; the new chunk names slipped past the `AdminApp-*` precache exclusion (precache
     32 to 55 entries, 2.06 to 2.93 MiB). Pages are static imports again, and
     `npm run check:precache` now fails the build if it happens again.
   - **"Download PDF" in the job drawer showed nothing.** The preview rendered inside the
     layout's `z-10` column, underneath the body-level drawer (already present in UI 1). It now
     renders in a body portal, is hidden when printing (the printable copy is separate), and
     joins the dialog stack: Escape closes only the preview, Tab stays inside it, focus returns
     to "Download PDF". UI 2's focus stack had made this worse (Escape closed the drawer too);
     regression tests cover both.
   - Factory reset gets a 10-minute timeout instead of the new 30 s default, so a slow photo
     cleanup is not reported as failed while it continues on the server.
   - Add job: the UNASSIGNED placeholder is excluded from the driver list; error text fixed.
   - Dev mock accepts `POST /api/admin/jobs`, so the Add job flow can be previewed.
3. `Normalise line endings to LF`: `.gitattributes`, whitespace only.
4. `Set up the repository for GitHub, Claude Code and deployment`: the app is now the repository
   root (it was the `web/` folder of a larger repo); `README.md`, `CLAUDE.md`,
   `docs/DEPLOYMENT.md`, this report, `.env.example`, `.nvmrc`, Node engines, GitHub Actions CI,
   harness pages moved to `harness/`, the redesign handoff moved to `docs/`, and
   `VITE_ADMIN_HOSTNAMES` so a staging domain can show the admin (production unchanged).
5. `Fixes from an independent review of the merge`: a separate reviewer checked commits 2 and 4.
   - **Precache exclusion by chunk graph, not file name.** `scripts/adminChunks.ts` marks every
     chunk reachable only through AdminApp as admin-only and Workbox leaves it out, so lazy admin
     pages can no longer leak into drivers' phones (a 3 KiB admin chunk already did). The check
     script now uses that graph, also fails if a driver file is missing from the precache, works
     on Windows and in folder paths with spaces, and rejects an invalid budget.
   - **Unused font subsets out of the driver precache** (Cyrillic, Vietnamese, latin-ext of the
     two new fonts, matching the existing Inter rule). Precache: 32 to 17 entries, 2.06 to 1.88 MiB.
   - **Job PDF in Midnight theme.** The report paper turned dark with unreadable text, on screen
     and in the printed PDF (present since the Aurora pass). Printable documents now always use
     the light palette.
   - `VITE_ADMIN_HOSTNAMES` ignores a scheme, port or path typed by mistake; its tests no longer
     depend on the environment.
   - Docs: nginx `proxy_read_timeout` for the long factory reset, accurate `/api` check after a
     deploy, CI trigger wording, and the two admin calls that do not use `adminFetch` yet.
   - `tsconfig.node.json` so `npm run typecheck` also checks `vite.config.ts` and `scripts/`.

## Verification

- `npm run typecheck`: 0 errors (app, Vite config and scripts).
- `npm run test:run`: 78 files, 446 tests passing.
- `npm run build`: passes. `npm run check:precache`: 17 entries, about 1920 KiB, no admin-only
  file precached, every driver file precached. Simulated lazy admin page: excluded automatically.
- Browser (Chromium, mock API, fictional data): all eight sections at 1440 px in Aurora Light;
  Overview and Jobs in Midnight Aurora; Overview, Jobs and the driver app at 390 px. No console
  errors, no page-wide horizontal scroll. Flows: Add job submits and shows the confirmation;
  job drawer, PDF preview on top, Tab trapped, Escape closes preview then drawer, focus returns;
  print output contains only the report, light paper in both themes. All harness pages load
  from `harness/`.
- Not verified here: the real backend, real phones (GPS, camera, push), screen readers,
  forced-colours mode.

## Behaviour changes to be aware of

These came with UI 2's integration round and were kept:

1. **Add job is now visible on Jobs.** The booking form existed in the old UI and UI 1 but had
   no button. It creates a real Calendar booking through `POST /api/admin/jobs`. If admins
   should not create bookings yet, remove the button in `pages/JobsPage.tsx`.
2. The Jobs list shows a loading state while a new filter or page loads, instead of the previous
   rows (so nobody acts on stale rows).
3. Live fleet zooms without animation (avoids a Leaflet error after leaving the page).
4. An expired admin session returns to sign-in with a message and clears cached data.

## Driver app replaced with the projectTMV redesign (October 2026)

The merge above kept the old web driver app. It has since been replaced with the driver
redesign from the `projectTMV` repository (tag `my-design-v1`, folder `web/web`). The admin
dashboard did not change.

- **Taken whole from the redesign:** driver screens (`src/screens/*Screen.tsx`, `screens/workflow/`),
  `src/app/`, `src/components/driver/`, photo and signature components, driver helpers in
  `src/lib/` (`jobFormat`, `driverInitials`, `usePendingCount`, `keepFocusedFieldVisible`),
  `ui/ConfirmProvider`, `ui/ThemedTooltips`, `ui/BrandLockup`, `ui/ShowMore`, `ui/InfoTip`,
  `styles/chrome.css`, driver tokens in `styles/tokens.css`, and the driver mock records
  (`mocks/driverRecords.ts`).
- **Removed** (no longer used by the redesign): `BookingWindowHeader`, `CustomerIdentity`,
  `JobDetailsPanel`, `JobTime` and the standalone `PwaSettingsScreen` (install help now lives
  in driver Settings). `screens/pwa-settings/hooks|lib|components` stay; the admin uses them.
- **Kept from this repository:** admin host routing (`lib/adminHost.ts`), `ui/Modal` and
  `useDialogFocus`, admin transport and mocks, Vite config and the precache guard.
- **Admin isolation:** the redesign adds document-wide behaviour, which now stands down while
  `html.tmv-admin` is set: `chrome.css` rules are scoped with `:where(html:not(.tmv-admin))`,
  and `ThemedTooltips` and `keepFocusedFieldVisible` check `isAdminDocument()`. The driver
  uses Hanken Grotesk for figures and a 450 body weight; `adminTheme.css` pins the admin back
  to IBM Plex Mono and 400.
- **Verified:** `npm run verify` (typecheck including harness pages, tests, build, precache
  check), driver screens compared side by side with the original redesign, admin computed
  styles checked against the previous build.

## Classic admin added at /temp (October 2026)

Talha's own admin dashboard from `projectTMV` (tag `my-design-v1`) ships alongside the Aurora
admin at `/temp`, so both designs can be used and compared on the live backend.

- Copied unchanged into `src/screens/admin-classic/` (one import now takes `Meter` from
  `ui/viz` directly). Added `src/ui/viz/`, `framer-motion` and the Tailwind keys it uses.
- Uses this repository's `ui/Modal` (focus stack) and `api/admin.ts` (`adminFetch`); its 318
  tests pass against them.
- Routing: `lib/adminHost.ts` (`isClassicAdminLocation`); `/temp` redirects to `/` on the
  driver domain. Same admin sign-in session as Aurora.
- Precache: both AdminApp entries are admin-only; `check:precache` requires both. The driver
  precache grew by about 26 KiB of shared Tailwind CSS.
- Dev mocks: `mocks/classicAdmin.ts` (with `adminRecords.ts`, `adminDispatch.ts`) answers first
  on `/temp`.

## Clean-up and handover (October 2026)

- `projectTMV` retired: its history is on branch `archive/projectTMV` and tag `my-design-v1`.
- Removed dead code found by walking the import graph from `main.tsx` and the tests (unused
  driver profile uploader, orphaned PWA-settings cards and hooks, unused evidence/table/audio
  helpers and test-only report components in both admins).
- Removed dev-only extras that never shipped: `harness/` pages, `test/*-check.tsx`, the
  `/?ui=gallery` page and the local `_original/` folder.
- Fixed: Jobs table no longer cuts off the Open column at 1440 px (`DataTable` `layout="fixed"`);
  report downloads and driver notices use `adminFetch` in both admins.

## Still open

See `CLAUDE.md`, "Known gaps and backlog": screens not built yet, backend data requirements,
and UI follow-ups (for example the Jobs table needs horizontal scroll at 1440 px).
