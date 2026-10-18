# 05. Functional gap analysis

Legend: **I** Implemented, **P** Partial, **M** Missing, **PL** Planned, **U** Unknown, **B** Backend.

| Area | State | Evidence and gap |
| --- | --- | --- |
| Job list, filters, bulk actions, job dialog | I | `pages/JobsPage.tsx`, `components/JobDetailModal.tsx` |
| Job lifecycle (READY, IN_PROGRESS, COMPLETED, CANCELLED, workflow steps) | I (client) / B (rules) | States seen in `api/jobs.ts`, `mocks/workflow.ts`; transition validation, duplicate completion, rescheduling rules are server-side and **U**. Mock state machine is a model, not the real one. |
| Driver assignment and reassign | I | `reassignJob`; bulk reassign limited to open jobs (previous audit). Conflict and availability checks: **M** (no schedule-overlap or distance logic in the client). |
| Time calculations (billing vs driver time) | B / U | Client shows `timeBilling` (`api/jobs.ts:6-18`: scheduled, allocated, actual, billed extra blocks, rate source). The example rules (1h30 -> 2h, 2h -> 2h, 2h30 -> 2h30) are **not** present in the frontend; they must be confirmed in the backend and covered by tests there. |
| Driver envelope / completion report | I | Driver summary form and manual details; comparison tab in the driver report shows system vs manual totals. Discrepancy workflow (review, accept, dispute): **P** (flags only, no resolution state). |
| Driver reports | I | Six tabs, PDF and CSV/XLSX export (`reports/exporters.ts`). Penalties and per-job adjustments: **U**. |
| Tunnel and congestion charges | P | Detection and counts come from the backend/tracker; UI shows them and a manual charge card. The windows are **hard-coded display text** (`RoadChargesTab.tsx:24-25`), not read from configuration (finding F-12). |
| GPS tracking | I (display) / B (source) | Live Fleet 10 s refresh, freshness "stale" state, tracker arrival `trackerArrival.ts`; GPS accuracy, interval, geofence logic **U**. |
| Fleet intelligence (nearest driver, travel feasibility) | M | No code. Recommend only after availability and schedule data exist (see roadmap). |
| Vans | I | Single table with warnings, compliance, fuel and mileage records. |
| Activity timeline | P | UI I; data B. Operational events catalogue verified against client code (`lib/activity/events.ts`). |
| Notifications and broadcast | I (send) / U (delivery) | `POST /api/push/admin/broadcast` with optional `driverInitials`; result `sent` counts subscribed devices. Sent, delivered and read are **not** distinguished by the API (only "accepted"); per-recipient history: delivery log exists for customer SMS/email, not for driver push. |
| Driver in-app notification history | I | IndexedDB written by the push worker; on-device only, so it is lost if the PWA is reinstalled and not visible to admin. |
| Internal booking system | PL / P | Admin "Add job" posts a booking (`AddJobModal`) and the job appears after Calendar sync. Website form, Make.com pricing and the Calendar extension are outside the repo (**U**). Pricing rules are in Settings (`PricingSettings.tsx`, backend settings). |
| Payments | PL / P | Driver records payment method per job; admin shows "recorded receipts"; no invoice payment records, refunds, partial payments or reconciliation (stated in `CLAUDE.md`). End-to-end Booking -> Job -> Charge -> Payment -> Reconciliation trace: **M**. |
| Driver web app | I | Offline outbox for scenario forms; workflow requires connectivity by design. |
| Authentication and roles | I (client) / B | Cookie sessions, separate admin and driver sessions; role model beyond admin and driver: **U**. |

## Planned items are not defects

Payments, bookings, charges and reconciliation, driver availability, on-time percentage, invoice payment tracking
and a "Critical" severity are documented as not built (`CLAUDE.md`, "Known gaps"). They are listed here only to
show their dependencies on the backend.
