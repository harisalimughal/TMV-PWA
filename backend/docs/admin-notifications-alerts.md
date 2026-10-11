# Notifications & Alerts

Client revision, 2026-10-11. Local implementation only; no deployment authorized.

The admin sidebar has one Notifications & Alerts destination (section=notifications). Its top-right switch selects Notifications or Alerts; Notifications is the default for ordinary sidebar entry. notificationsTab records explicit view selection and restores via browser history. Old section=alerts links still open Alerts under the combined sidebar destination.

The existing NotificationsPage and AlertsPage are reused without changes to their filters, queries, tables, push/device/broadcast actions, dismissal flows or API endpoints. Only the selected page mounts and requests data, matching their prior separate-section behavior. Switching views unmounts the old page just as navigating between the old sidebar sections did; this revision does not introduce a new cross-page filter-state contract.

The separate Alerts sidebar entry is removed, the sidebar/header label is Notifications & Alerts, and the command palette offers the combined destination. Existing explicit links preserve their intended Alerts view; unrelated URL date parameters are retained.

Verification: default view, top-right alignment, switching/history, legacy links, shared sidebar highlighting and default sidebar entry are covered by focused tests. Frontend typecheck and production build passed. No notifications were sent and no backend data was modified for this change.
