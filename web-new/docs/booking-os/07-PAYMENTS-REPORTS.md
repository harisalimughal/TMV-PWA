# Booking OS: payments, reports and analytics

Principle: **one ledger.** Booking OS does not store money received. It reads what the existing payment and
reporting systems report and shows unknown as unknown.

## Payments

- The booking workspace Payments tab shows agreed, collected and outstanding amounts from the booking record.
  A figure the server does not provide reads "Not recorded". The payment state is `unknown` unless the server
  says otherwise, and the tab says nothing is assumed.
- The agreed amount is the approved quotation version's total. It is not "money received".
- Not built: recording a payment, invoices, refunds, reconciliation. These stay in the existing system. When a
  payment feed exists, bookings link to its records by id; they never copy balances.

## Reports and analytics

- The Command Centre figures come from `GET /api/admin/bookings/summary`. Each metric is `{ value, unavailableReason }`.
  Revenue is a **known subtotal** with the number of unpriced bookings stated. Driver utilisation is `null` when
  shift data is missing; it is never computed from partial data and shown as complete.
- Generate Report (drivers and jobs) is unchanged and does not read bookings. Reporting on bookings (enquiry
  conversion over time, quote-to-booking, booked hours) needs server-side aggregates; client-side aggregation of
  a partial page would be misleading and is not done.

## Needed from the backend

Server aggregates for the summary endpoint, a payment feed keyed by booking id, and a documented revenue
definition (see `docs/redesign-handoff.md`).
