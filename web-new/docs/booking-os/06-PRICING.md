# Booking OS: pricing management

Status: **not built, by design.** This repository has no pricing engine and no copy of the Make.com pricing
rules. Nothing in the dashboard calculates a booking price, and no price here has been invented.

## What exists today

- Staff can record a **manual price** on an enquiry. It needs a reason, is stored as a quotation version with
  `source: "manual"`, and is shown as "Manual price". An enquiry with no price shows its pricing state and why,
  never `£0.00`.
- Settings, Pricing shows a "Booking quotes" panel stating the engine is not connected and listing the gates
  below. It has no price fields. The existing job rates on that page are untouched and are not copied to bookings.
- The "Calculate quote" action calls `POST /api/admin/enquiries/:id/quotations`. With no engine the preview
  server answers `422 pricing_unavailable`, and the dashboard shows that message.

## Required before automatic quotes

1. **Pricing as a pure, versioned function.** Same inputs and version give the same lines and total. A rate plan
   is immutable once published; a change is a new version with an effective date.
2. **Golden cases.** A fixture set of real past jobs with their agreed prices, run against every version.
3. **Parity with Make.com.** Run the new function and the current Make.com pricing on the same inputs in shadow
   mode. Every difference is listed with an explanation. Activation is blocked while unexplained differences remain.
4. **Gated activation.** A named person approves a version after a passing parity run. Activation is reversible
   (switch back to manual or to the previous version) and recorded in the audit trail.
5. **Overrides.** Any change to a calculated price needs a reason, and the original calculated quote stays in
   the version history.

## Open inputs from the business

The rates, minimum charges, overtime, congestion and tunnel rules, and how helpers and van types combine. These
exist today in Make.com and in the job settings; they must be supplied or exported, not reconstructed from the UI.

## Proposed endpoints (not implemented)

`GET /api/admin/pricing/rate-plans`, `POST /api/admin/pricing/versions`, `POST /api/admin/pricing/versions/:id/activate`,
`GET /api/admin/pricing/parity`. See `02-TARGET-ARCHITECTURE.md`.
