# Driver data: where it lives and what was checked

Written for the request to bring the real TMV drivers into the new dashboard
(October 2026). Short version: the real driver records were never in the frontend.
Both the old and new dashboards read them from the same backend, so there is nothing
to copy into this repo, and nothing here may invent them.

## Source of truth

- The driver roster is the backend's `driver_accounts` MongoDB collection, served by
  `GET /api/admin/drivers` (`src/api/admin.ts`, `AdminDriver`: email, initials,
  fullName, phone, vanRegistration, role, active, hasPassword, lastLoginAt).
- The old deployed dashboard (`old_web.zip`) reads the same endpoint through
  `useDriverOptions`. The driver picker in the supplied screenshot (Aragao (AR) ...
  Wander (WD), with the PDF button and "Manual Entries (reported)") is the old
  Driver Report page's selector, filled from that endpoint. None of the nine shows
  "(Inactive)", so all nine are active account rows in that collection.
- The new dashboard uses the same endpoint and the same hook for every driver list:
  Drivers, Jobs (assign and reassign), Add job, Overview, Driver report, Liability.
  The Van page and Live fleet show the driver attached to each van record or tracker
  by the backend. There is no second roster in the Aurora admin.
- The backend lives in other repositories. This repo has no database, schema,
  migrations or seed data, so a migration, duplicate check or dry run cannot be
  written or run here.

## The nine reference identities

What the supplied files contain for each one. Emails, phones, vans and database IDs
are not in any supplied file; they exist only in `driver_accounts`.

| Display | Code | Evidence in the old frontend | Confidence |
| --- | --- | --- | --- |
| Aragao | AR | Only in the screenshot | Account row (from the picker); details unresolved |
| Caio | KA | Old fallback name map: "caio" or "ka" -> KA | Verified code KA, not CA |
| Henrique | HE | Fallback map: HE | Verified code |
| Maico | MK | Fallback map: MK | Verified code |
| MAN VAN | MA | Picker only; see below | Unresolved classification |
| Paulo | PL | Only in the screenshot | Account row; details unresolved |
| Rafael | RF | Fallback map: RF | Verified code |
| Tiago | TI | Fallback map: TI | Verified code |
| Wander | WD | Fallback map: WD | Verified code |

The fallback name map is a hardcoded list in the old `ScenariosPage.tsx` (kept,
unrouted, in `src/screens/admin-classic`). It also names MR and HA, which are not in
the current picker. The Aurora admin does not use it: it takes the server's
`driverName` and `driverInitials` and never derives a code from a name.

**MAN VAN (MA).** It is a row in `driver_accounts` (the picker lists accounts only).
The old code has one related note: jobs once carried the display name
"Man VAN Driver" while their real code was HE, and deriving a code from that name
wrongly produced "MA" (`utils/drivers.ts`). Whether MA is a shared company login, a
placeholder or a person cannot be settled from the files. It is shown exactly as the
backend returns it and is not treated as an employee profile.

**Van page shows 8, picker shows 9.** The Van page lists vans that have submissions
in the selected date range (`/api/admin/van/drivers?from&to`); the picker lists
every account. A driver with no van submission in the range is not on the Van page.
Nothing was added or removed to make the counts match.

## Assignments and initials

Jobs, calendar imports, scenarios and reports key drivers by the code
(`driverInitials`). The code is the stable identifier the backend uses today; the new
dashboard keeps it as is for display and filtering. Moving assignments to a separate
database ID is a backend change (schema plus a mapping from code to ID) and was not
made here.

## Restored from the old dashboard

- Driver report, Payments tab: "Manual entries (reported)" (backend
  `paymentCards.manualEntriesKnownPence`, what the driver reported collecting in their
  job submissions, with the missing and invalid entry counts) and "Outstanding"
  (`paymentCards.outstandingPence`, final charges minus manual entries; "Not recorded"
  until every entry is in). These are not driver pay or company revenue.
- Working hours already exist as "Working time" (`workingMinutesKnown`), unchanged.

## Demo and dev data

The mock API (`src/mocks/admin.ts`, used by `npm run dev` and the preview build) lists
the same nine names and codes as the real picker, in place of the old placeholder
drivers. Their emails and phones are left empty because the real ones are not in any
file here. The three van registrations on Caio, Rafael and Tiago are demo values.

## Needs the backend or a database export

1. A read-only export of `driver_accounts` (no password hashes) to fill the mapping
   table above with IDs, emails, phones and vans.
2. A decision on what MA represents.
3. Any move from initials to database IDs for assignments, with an idempotent,
   dry-run migration in the backend repository.
