# Jobs page

Code: `src/screens/admin/dashboard/pages/JobsPage.tsx`, `components/jobs/` (cards and
presentation rules), job detail in `components/JobDetailDrawer.tsx`.

## Layout

- Header: "Jobs", the range in London time, Add job (primary) and Export (CSV of all
  filtered jobs from the server, or of the ticked jobs).
- Filter panel, row one: search, driver (name and stored initials), date presets and
  custom range. Row two: status chips with exact counts, attention note, refresh, view.
  Active filters show as removable chips with one Clear filters action.
- Status counts come from one page-size-1 request per status with the other filters
  applied, so they are totals for the filter, not for the visible page. The attention
  note counts the visible page only and says so by sitting next to it.
- Cards (default) and Table read the same request, sort and page. The view is in the URL
  (`view=`) and remembered in this browser (`tmv:jobs-view`). Switching keeps filters,
  page and selection.

## Job card

Status bar (reference, status badge, action menu), schedule, customer (the card's link),
crew and van when stored, route as two connected stops (full address in the tooltip and
the drawer), driver by stored initials or an amber "No driver assigned", one labelled
amount, and a footer with the first issue or the payment line.

- Status colour is a thin edge plus the badge text: Scheduled grey, In progress violet,
  Completed green, Cancelled red; an active job without a driver is amber.
- Amounts: completed jobs show the final charge; open jobs the calculated charge;
  cancelled jobs a dash. A zero calculated charge on an open job with no base price and no
  billing rate is "Not priced", never £0.00; a zero with pricing evidence stays £0.00.
  A completed job whose final charge is far above its priced parts is flagged "Final
  charge to check". Payment lines separate paid online, recorded receipts, invoices and missing
  methods.
- The checkbox and the action menu (open, assign or reassign, copy reference, delete)
  never open the job. Reassign and delete reuse the existing confirmed dialogs.

## Table

Same columns as before, refined: bold time, customer with a pickup to drop-off line,
driver avatar with initials and crew, status badge, labelled charge, and a severity pill
for the first issue ("No issues" when there are none). Expandable rows were not added:
the job drawer opens over the list and keeps the list's state, which covers the quick
look without duplicating the detail.

## Selection

A floating bar shows the count with Reassign, Export, Delete and Clear. Reassign
only moves scheduled and in-progress jobs; completed and cancelled ones keep their
recorded driver and the dialog says how many were left out. Selection is
cleared when filters, sort or page change (the selected jobs would no longer be visible)
and kept when switching views.

## Job drawer

The header now has a summary band: route as two stops, the driver (or "No driver
assigned"), and the final and calculated charges. Tabs and actions are unchanged.

## Demo data

The demo's last seven days follow a real jobs export (`src/mocks/fixtures/exportJobs.ts`):
references, drivers, times, durations, delays, statuses, charges, payment methods and
evidence states. Customer names, phones and street names are fictional; only postcode
districts are kept. Production reads the backend as before.
