# Booking OS: release readiness (this branch)

**Verdict: not production ready.** The screens are complete against a clearly labelled preview server. There is no
backend for them. Nothing here has been connected to production data, Make.com, Google Calendar or the website.
Make.com and Calendar must stay as they are.

## What was verified

| Check | Result |
| --- | --- |
| `npm run verify` (typecheck, all tests, build, precache) | Passed on every committed stage; last full run 186 files, 1,422 tests |
| Precache budget | 2,177 KiB of 2,400 KiB; booking code is admin-chunk only |
| Contract, state tables, London time and DST, validation, preview server | Unit tested (`src/lib/booking`) |
| Screens | Component tests per view, including blocked actions, concurrency, no `£0.00`, missing data |
| Theme contrast | Tested (`bookingTheme.test.ts`) |
| Accessibility, automated (axe, WCAG 2.2 AA) | 0 violations across 10 states in light and dark after fixing 3 found issues |
| Layout | No horizontal overflow at 390 and 1440 px; screenshots in `docs/booking-os/screenshots/` |

## What was not verified

- Any live backend behaviour: every `/api/admin/...` booking endpoint is a proposal (`02-TARGET-ARCHITECTURE.md`).
- Screen reader use, forced-colours mode, keyboard-only walkthrough by a person, real touch devices.
- Drag and drop with a pointer (covered by the same server-checked panel, which is tested; the drag gesture itself is not).
- Load and performance with real volumes; the preview data is a few dozen records.
- Microsoft Office and email rendering are unrelated to this module and were not touched.

## Google Calendar

See `10-GOOGLE-CALENDAR.md`. The sync engine and Settings screen are built and tested against a fake calendar; the OAuth flow, token storage and worker are backend work and not built. Nothing is connected to Google.

## Blockers before any real use

1. **Backend.** Enquiries, quotations, bookings, assignments, availability and the summary, with transactions,
   idempotency keys, optimistic versions, an audit log and an outbox. Server-side validation of every rule the
   client shows. Authorization per action.
2. **Pricing engine** with golden cases and a Make.com parity run (`06-PRICING.md`).
3. **Website intake** endpoint with HMAC signing, rate limiting and duplicate detection (`04-WEBSITE-INTAKE.md`).
4. **Availability data:** shifts and leave for drivers and vans. Until it exists, drivers show "Unknown".
5. **Travel time** source for conflict buffers; today it is always unavailable and not used.
6. **Notifications:** no message is sent to customers or drivers by any action here. That needs the existing
   notification service, with delivery status.
7. **Payments feed** (`07-PAYMENTS-REPORTS.md`) and a documented revenue definition.
8. **Driver app:** a booking becomes a job only through the existing job creation path (`05-DRIVER-INTEGRATION.md`);
   that bridge is not built.
9. **Security review** of the new endpoints once they exist (this branch adds no server code).
10. A staged migration with a rollback plan (`03-DELIVERY-PLAN.md`): observe, shadow, internal-first, then primary.

## Known gaps in the screens

- "Mark duplicate" and "Notify driver" actions are listed by the server model but have no UI.
- Edit booking and reschedule from the details dialog are not built; rescheduling is on the Calendar.
- The wizard saves an enquiry only, by design; confirming happens in the inbox.
- Preview data resets on reload (in memory); only the wizard draft persists, in this tab's session storage (it holds customer details, so it is cleared when the tab closes, on save and on Discard).

## Client-side security review (this branch)

Reviewed by search and reading, not by a penetration test.

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or console logging in booking code; all customer text is rendered by React.
- All backend calls go through `adminFetch` (cookies, timeout, 401 handling). No credentials or keys are stored client-side.
- Browser storage: the source choice (`tmv:booking-source`, live or preview) in local storage; the wizard draft in session storage (changed from local storage after this review, because it holds personal data).
- Writes carry idempotency keys and the record version, so a retry or a stale screen cannot double-apply or overwrite. This is only meaningful once the server enforces it.
- The client never decides authorization: actions shown come from `allowedActions`, and the server must refuse the rest.
- Preview mode never calls the backend. It is selected explicitly and labelled on every screen.
