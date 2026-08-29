# TMV Driver PWA

Mobile-first installable PWA for drivers, live at `chat.themanvan.co.uk`. Separate
project from `TMV-Chat-bot` (which keeps running unchanged as the admin dashboard +
existing Google Chat bot). This is a from-scratch REST API + React UI porting that
project's job-workflow logic (same states, same business rules) to a driver-facing app
instead of Chat cards -- with its own datastore, not Sheets. Google Sheets and Drive
were fully removed from this project (Aug 2026) -- everything below is MongoDB-backed,
including a self-contained `/admin` UI for the driver roster and settings that used to
live on TMV-Chat-bot's dashboard.

## Architecture

- **Jobs/bookings/evidence/activity**: MongoDB Atlas (`db/*.repo.ts`). Booking data
  still comes from Google Calendar (`google/calendar.ts`, unchanged) -- a background
  sync (`jobs/booking.service.ts`, run on an interval by `server.ts` and throttled
  on-demand by `jobs.service.ts`) parses Calendar events into Mongo the same way it
  used to write Sheets rows.
- **Driver roster** (initials, phone, van registration, role, active flag): MongoDB's
  `driver_accounts` collection (`db/mongo.ts`, `auth/driver-account.service.ts`) --
  the same collection that already held login credentials, now extended with profile
  fields. Admin-managed via this app's own `/admin` Drivers screen
  (`auth/admin.routes.ts`, `web/src/screens/admin/`), not TMV-Chat-bot's dashboard.
- **Evidence photos** (arrival/loaded/empty-van, scenario-form photos, signatures):
  Cloudinary (`storage/cloudinary.ts`), not Google Drive. Upload is synchronous -- the
  camera upload posts real bytes directly, so there's no Chat-attachment-relay step
  and no async queue/worker/reaper (all deleted; they existed only for that two-hop
  design). Live-verified end to end with real credentials.
- **Driver auth**: MongoDB (`auth/*.ts`) -- password login, forgot/reset password
  (email via Gmail, same domain-wide-delegation setup as TMV-Chat-bot), and the
  password-setup-link flow (signed link, verified against `driver_accounts`).
- **Customer emails** (job completion, review request, password reset): Gmail
  (`google/gmail.ts`, unchanged).
- **Admin** (`/admin` -- password-protected, separate session/cookie from driver
  logins, see `auth/admin-session.ts`): driver roster CRUD and a settings screen
  (email templates, crew/packing/overtime rates, the signature-step confirmation
  text) backed by a generic Mongo key/value store (`db/settings.repo.ts`, keys listed
  in `admin/settings-spec.ts`). `config/env.ts`'s values are only the fallback until
  an override is saved.
- **Scenario forms** (Check In, Check Out, Parking Liability, Liability Report):
  ported from TMV-Chat-bot's `chat/scenario.engine.ts` -- same fields, legal notices,
  and signature text (`workflow/scenario.spec.ts` / `web/src/scenarioSpec.ts`, kept in
  sync manually). The original drove these as a one-field-per-Chat-card wizard with
  persisted step state; this renders the whole form on one screen instead
  (`jobs/scenario.service.ts`, no step machine needed). Check In/Check Out are
  always-available actions (storage jobs); Parking Liability/Liability Report are also
  reachable from the classic flow's "any issues?" step, and submitting one resumes the
  paused job automatically.

## Deliberately deferred / simplified from the original Chat-bot workflow

- **Customer-facing signature link**: the original design texted/emailed the customer
  a separate signature-pad link for their own device. This app instead pops up a
  signature-pad modal in the driver's own app (`components/Modal.tsx` +
  `components/SignaturePad.tsx`) -- the driver hands their phone to the customer to
  sign, rather than a link going to the customer's own device.
- **Customer notification scheduling** ("your driver is arriving in 60 minutes"):
  not ported -- left entirely to TMV-Chat-bot, so a booking handled by both systems
  doesn't get the reminder sent twice.

## Local dev

```bash
# backend
cd backend && npm install && npm run dev   # listens on PORT (see .env)

# frontend (separate terminal)
cd web && npm install && npm run dev       # :3001, proxies /api and /healthz to :8090
```

Backend `.env` needs: `MONGODB_URI`, service-account credentials (Calendar + Gmail),
`GOOGLE_CALENDAR_ID`, `DRIVER_SETUP_LINK_SECRET` (must match TMV-Chat-bot's value
exactly, if that project's setup-link flow is still used), `TMV_SIGNATURE_LINK_SECRET`,
`TMV_ADMIN_PASSWORD` (`/admin` login), `CLOUDINARY_URL`. See `config/env.ts` for the
full list and defaults.

## Deployment

Live at `chat.themanvan.co.uk` on the same VPS as `dashboard.themanvan.co.uk`
(`2.57.90.26`), same pattern: `docker compose` + nginx + certbot. Redeploy with
`ssh root@2.57.90.26 "/opt/tmv-pwa/deploy/redeploy.sh"`.

## Not started yet

- A professionally designed app icon -- current ones (`web/public/icons/README.md`)
  are a stand-in cropped from the existing marketing logo, functional but not polished
