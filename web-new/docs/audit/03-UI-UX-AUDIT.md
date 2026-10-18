# 03. UI/UX audit

Basis: component source, the design tokens, automated theme tests, and browser inspections of the mock-data
build at 1440, 1024, 768, 390 and 320 px in light and Midnight (see `docs/FINAL_AUDIT.md`,
`docs/OVERVIEW_AUDIT.md`, and screenshots taken this engagement). Not tested: real data volumes, real devices,
screen readers, forced colours beyond the earlier pass.

## Design system (Implemented)

Tokens: `adminTheme.css` (`html.tmv-admin`, `[data-admin-theme="dark"]`); components in
`dashboard/components/ds/` (Action, Badge, Notice, Tabs, Toolbar, Table, Dialog, Drawer, charts). Aurora Light is a
neutral off-white with one violet accent; Midnight is true black with pure-grey neutrals. Tests enforce AA
contrast and ban navy hex values. The driver app has its own token set (`src/styles/tokens.css`) and does not
inherit the admin palette.

Findings:
- **U1 (P2). Mixed control styles.** Native `<select>` elements in Activity and the Broadcast composer use the
  platform font size, while the rest of the toolbar uses design-system controls (`controlBase`). Visible in the
  Activity filter block. Fix: one `Select` primitive in `ds/`.
- **U2 (P2). Two chart toolkits of conventions.** Recharts charts use `CHART.*` colours consistently, but KPI
  tiles, rings and sparklines were hand-built per page. A shared stat tile would remove drift.
- **U3 (P3). Modal title is a string in some dialogs and a node in others.** `Modal` accepts a node; only the
  composer uses an icon. Standardise header anatomy.

## Navigation and information architecture (Implemented)

Nine destinations in four groups; shortcuts O, J, A, D; command palette; filters live in the URL so Back and
reload restore them; job opens as a centred dialog over any page. Verified by `Layout.navigation.test.tsx`.
- **U4 (P2). Notifications live under "Alerts and messages", Notify Driver under Activity.** Two entry points, one
  composer (now shared). Acceptable; label the sidebar group consistently ("Communication").

## Overview

Status mix is shown once (duplicate charts removed, `OVERVIEW_AUDIT.md`); KPI row: Total jobs, Final charges,
Recorded receipts, Late arrivals. Date toolbar: Today, Yesterday, Last 7 days and two date pickers.
- **U5 (P2). KPI cards do not link to filtered Jobs.** Verified: tiles are not navigation targets. Add
  click-through (`?section=jobs&status=...`).
- **U6 (P2, Backend). Overview aggregates in the browser.** Up to 30 pages of 100 jobs; slow on large ranges.

## Jobs

Cards: header (driver, time, status, menu), customer and booked price, description, issue warning, reference and
labelled total (this session). Centred dialog for detail (preferred pattern, implemented).
- **U7 (P2). Card shows "No description recorded" for export-derived demo jobs.** Data, not a defect; in production
  the Calendar title fills it.
- **U8 (P3).** Driver availability dot omitted: no verified availability data exists.

## Drivers

Card: avatar, name, shield (has app account), ACTIVE badge, contact, van chip, four metrics, review reports,
pencil edit on the card (implemented). Metrics use the drivers summary; `revenueAnomaly` flags implausible totals.
- **U9 (P2).** Card contact lines show "Email not recorded" for every demo driver because the roster has no
  emails; in production the data decides.

## Van, Liability, Alerts, Settings

Implemented with the same primitives. "Needs Attention" tab removed in favour of row warnings (done).
Alerts has three views and a composer; delivery log shows one card per job on phones.

## Activity and Notifications

Activity is a two-panel layout with day separators, unread, filters, Notify Driver. It never claims delivery or
read state. **U10 (P1, verified).** Polling for unread runs forever against a server without the endpoints
(`useActivity.ts:22-31`).

## Driver app

Large touch targets, one primary action per step, offline banner, persistent alert host. Unverified on real
devices. **U11 (P2).** `JobWorkflowScreen.tsx` is 1,555 lines: a single component owns every step; splitting by
step would lower regression risk when workflows change.

## Accessibility (WCAG 2.2 AA)

Implemented: 1,028 `aria-*` attributes in source; dialogs share one focus stack (`useDialogFocus`); status is
never colour only; reduced-motion respected in chat scroll; contrast tests for tokens.
Gaps: **A1 (P2)** no automated accessibility tests (no axe or equivalent in `package.json`); **A2 (P2)** no
screen-reader pass recorded for Activity, composer, cards; **A3 (P3)** charts have no data-table alternative.
