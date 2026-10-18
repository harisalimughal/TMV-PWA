# Notifications audit: legacy against Aurora

Evidence: `src/screens/admin-classic/dashboard/pages/NotificationsPage.tsx` and
`components/SendBroadcastPushModal.tsx` (Talha's earlier admin, identical to branch
`archive/projectTMV`), against `src/screens/admin/dashboard/pages/AlertsCenterPage.tsx`,
`components/SendBroadcastPushModal.tsx` and `components/settings/DeviceNotifications.tsx`.
The backend lives in other repositories; only the frontend call sites below were inspected.

## Feature matrix

| Feature | Old implementation | Aurora before this change | Action |
| --- | --- | --- | --- |
| Broadcast notice | "Broadcast notice" header button. One-step modal: recipient (all active drivers or one), title, message, tap URL. `POST /api/push/admin/broadcast` with `{ title, body, url, driverInitials? }`. Channel: web push to the recipients' subscribed devices. No attachments, no history, no per-device tracking. | Present, and stronger (compose, then review audience, count and preview, then "Send now", with a warning that it cannot be recalled). Reachable only from the Delivery log tab, so it looked missing from the other two tabs. | Moved to the page header, visible on every tab. Zero-device results are no longer reported as success. Double-send guard. |
| Device push set-up (subscribe, test) | Card on the page: subscribed state, "Enable device alerts", "Test my device" | Settings, Notifications (`DeviceNotifications.tsx`): enable, test, turn off. Alerts page shows a short notice linking there. | Already present. No change. |
| Customer email and SMS delivery log | Per job: job ID, customer, driver, started, email address and status, phone number and status. Source: `GET /api/admin/notifications` (email and SMS rows from the bot's activity log). | Present as the Delivery log tab, but without the email address, the phone number (and its invalid-number warning) or the driver. The API already returns them. | Restored: email target, formatted phone with a text warning when it cannot be dialled, and the driver code. |
| Status filter | All / Sent / Failed / Pending | All / Failed / Pending / Sent, with counts | Already present. |
| Search, date range, pagination | Job ID or customer, date range, 25 per page | Same | Already present. |
| Bulk delete | Select rows, Delete. `POST /api/admin/notifications/dismiss` (hides the job from the list, not a true delete) | "Hide N selected" with confirmation, same endpoint | Already present. |
| Fleet alerts | Moved out of Notifications before the classic admin | "Fleet events" tab | Already present. |
| Needs attention | Not in the classic admin | "Needs attention" tab, shared with the header bell and Overview | Already present. |

## Access, recipients, channels

- Access: one admin session cookie. The frontend has no admin role model, so there is no per-role
  gating to preserve or restore; the backend enforces the session on every call.
- Recipients: all active drivers, or one driver by initials. No customer broadcast exists.
- Channel: web push only. It does not create an email or SMS, and no attachment is supported.
- Delivery tracking: the backend answers with `result.sent` (subscribed devices that accepted the
  push). That is the only count available, so partial failures cannot be reported per device.

## Safety

- Nothing is sent on page load or when the modal opens. Sending needs Review, then Send now.
- The success message appears only after the backend answers OK, and not at all when zero devices
  received it.
- One request per confirmation, however many clicks.
- The mock API refuses every `/api/push/*` call (503), so the demo, dev and tests cannot send.

## Not verified

- The backend's own role checks and its full broadcast response shape beyond `result.sent`.
- Whether a "mark all as read" for the header bell was part of any earlier release; the bell and
  its read state (`useAlertsRead`) are unchanged by this work.

## Needs the backend

- Per-device or per-driver delivery results for a broadcast.
- A broadcast history or audit record.
- Scheduling and attachments (never existed in the legacy page).
