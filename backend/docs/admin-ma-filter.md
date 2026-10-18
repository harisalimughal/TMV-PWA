# Overview MA inclusion preference

Overview has an **Include MA** switch, off by default. The browser remembers
the choice in `tmv:admin-include-ma`. Turning it on includes MA (MAN VAN) again.
The preference applies only to Overview totals, charts and its attention/live
panels. Jobs, Drivers, broadcast recipients, reports, exports, Activity, Bookings,
fleet/alerts, scenarios and van mileage continue to include MA.

Ordinary GET/HEAD requests explicitly include MA and navigation downloads carry
`includeMA=1`, independent of the Overview preference. Overview's job and vehicle
reads opt into `includeMA=0` when excluded; shared fleet/message feeds are filtered
locally for Overview without changing their shared caches. The query parameter takes
precedence over the header. Legacy
clients without either preference retain all-driver behavior. Writes and background
processing retain their existing behavior. No stored record is edited or deleted.

Job filtering uses the same historical reporting identity as the dashboard:
report identity, time-billing identity, legacy driver summary, then assigned driver.
Matching is exact, case-insensitive MA. Filtering happens before pagination and
counts. Read caches and Overview query keys distinguish the two scopes. Changing
the preference does not clear other pages' caches or remount the admin layout.
Unsaved-edit confirmation applies to a local toggle change.

This is a display preference, not an access-control boundary. Raw GPS event history
remains tracker evidence; it is not a driver totals view. Reconciliation context is
retained where needed to associate shared-tracker evidence correctly.

Money meanings are unchanged: **Calculated charges** are system pricing; **Final
charges** are completion-entered amounts, including invoices (the old report's
**Driver Collected** field). **Recorded receipts** are cash, card, bank and payment-link
records excluding invoices. Manual driver submissions are a separate measure.

Regression coverage includes request scope, concurrent cache separation, historical
identity and pagination, the synthetic large-MA-charge case, browser persistence,
unsaved-edit handling, independent Overview query scopes and all-driver defaults
for other pages, broadcast rosters and exports.

Validation: backend 638 tests passed and build passed; frontend typecheck,
24 focused MA/transport/navigation tests, 33 separately rerun UI tests and production
build passed. The full frontend suite stalled with worker timeouts and was stopped;
all four affected files passed on their separate rerun. No push or deployment.

Overview-only correction: frontend typecheck and 79 focused tests passed, followed
by all 13 broadcast tests passing after adding the MA recipient regression
(80 distinct tests across these checks). No backend or stored-data change was needed
for this correction.
