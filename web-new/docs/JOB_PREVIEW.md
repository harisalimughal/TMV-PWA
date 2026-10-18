# Job preview and Job Report

Jobs, Open job opens the centred job dialog; Download PDF opens the Job Report. Both read
the same functions in `src/screens/admin/dashboard/components/jobdetail/model.ts`, so a
milestone, charge or comparison cannot differ between the screen and the document.

## Dialog
- A centred dialog (`ds/Dialog.tsx`, up to 1160 px wide and 92vh tall, full screen below 768 px)
  with a sticky header (customer, reference, Copy ID, grouped badges, tabs) and footer and one
  scrolling body. Safe-area padding, reduced-motion aware, focus trap, Escape and scrim close it,
  focus returns to the opener, background scroll is locked. The old right-hand drawer is no longer
  used for jobs (the `Drawer` remains for the Driver profile panel). Every entry point (cards,
  table, Global Search, Driver Report, saved links) opens it through `?job=`.
- Timeline & evidence uses two columns from 1024 px: timeline and durations on the left,
  evidence completeness, photos and signature on the right. Narrower screens stack them in the
  same order.
- Summary: route, driver, schedule and charges. "Not yet charged" and "Calculated" stay separate.
- Tabs: Details, Timeline & evidence, Charges & payment, Activity. All earlier actions remain
  (Download PDF, Reassign, Mark as finished, manager review, photo delete).
- Primary footer action depends on state: Download PDF for completed or cancelled jobs,
  Assign or Reassign driver for scheduled and active jobs.

## Rules
- Lifecycle comes from the backend status only. A scheduled job shows "Not yet"; a completed
  job with a gap shows "Not recorded"; a tracker gap with a stated reason shows "Unverified".
- Call and email links appear only for values that validate. Original booking text is plain
  text (no HTML, no remote content) with copy, wrapping and a structured/original switch.
- Money: calculated, final and recorded receipts are three measures. Invoices are billed, not received.
- No fabricated GPS, photos or signatures. Demo photos are generated placeholders.

## Job Report (PDF)
Branded A4 "Job Report": header, overview, route, customer and booking, driver and vehicle,
eight milestones with source, charges table with amount types, time breakdown, driver
submission with system comparison, customer sign-off, evidence photos, original booking text.
Pages are packed from fixed heights (`buildDossierPages`); table headers repeat and every page is numbered.

### Audience
It is an internal operations record: it includes customer contact details and the original
booking text. Do not send it to customers. Customer-facing documents are the liability and
storage scenario PDFs. A customer version would need its own redacted template.

## Field mapping
| Legacy / need | Now | Backend needed |
| --- | --- | --- |
| Customer, phone, email | Details, PDF | none |
| Van registration | driver roster lookup | job should carry it |
| Tracker drop-off arrival and departure | `dropoffTracking` (Not recorded when absent) | job API must return it |
| Eight milestones and sources | model.ts | none |
| Photos with time and place | gallery, viewer, PDF | none |
| Original booking text | Details, PDF | none |
| Driver-reported time and money | comparison | none |
| Activity categories | grouped from action text | typed event categories |
| Customer-facing PDF | not built | redacted template |
