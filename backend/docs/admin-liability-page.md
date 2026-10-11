# Unified Admin Liability Page

Client revision, 2026-10-10. Consolidates the existing four admin scenario destinations, not the removed Driver Report penalties tab.

## Navigation

The sidebar and command palette have one Liability destination (`section=liabilities`). Inside it, a segmented switch selects Check In, Check Out, Parking Liability or Liability Reports. The active view is recorded in `liabilityTab` and restores on browser history navigation. Old `section=checkin`, `checkout`, `parking` and `liability` links still open the corresponding view with the unified sidebar entry selected.

Only the active scenario page mounts/loads. Switching resets its pagination and closes its old detail/configuration view. On mobile all four switch labels remain visible in a two-row layout; desktop uses one row, following existing segmented-control conventions.

## Filters and Existing Actions

Driver, search and from/to dates are shared across the four views and retained when switching. Date presets remain Today, Yesterday, Tomorrow and 7 Days, with custom dates. Existing scenarios/parking tables, submission details, evidence, refresh, exports and liability-category management are reused rather than replaced. Standalone page callers retain their prior local-filter behavior through the optional shared filter control.

No amounts/forms, backend routes, permissions, stored records or integrations were changed. This is an admin organization/filter-state revision, not new liability-charge intake. Existing export behavior is retained; this change does not introduce a new server search/export contract.

## Verification

- 14 focused tests cover the four views, shared driver/search/dates, pagination reset, keyboard/history behavior, old links, canonical admin routing and the single sidebar destination.
- Full frontend regression: 229 tests across 50 files passed; frontend typecheck passed.
- Final frontend build passed after the mobile layout refinement; the existing large-bundle warning remains.
- Browser used synthetic records only: all four views loaded, driver/search selections survived switching, and mobile at 390px showed all tab labels without page overflow.
- Preview: `http://127.0.0.1:5181/phase8-check.html?preview=liability&section=liabilities`. Read-only fixture API responses are synthetic; live `/api` access is blocked and there is no backend proxy. Detail/configuration mutations are not exercised in this preview.
- No production/staging database access, stored-record mutation, notification/provider calls, push or deployment.

Main files: `pages/LiabilityPage.tsx`, `liabilityPage.css`, `hooks/useScenarioFilters.ts`, reused `ScenariosPage.tsx`/`ParkingLiabilityPage.tsx`, accessible shared filter labels, `AdminApp.tsx`, `Layout.tsx` and `CommandPalette.tsx`.
