# TMV Driver PWA

Mobile-first installable PWA for drivers, live at `chat.themanvan.co.uk`. Separate
project from `TMV-Chat-bot` (which keeps running unchanged as the admin dashboard +
existing Google Chat bot). This is a from-scratch REST API + React UI porting that
project's job-workflow logic (same states, same business rules) to a driver-facing app
instead of Chat cards -- with its own datastore, not Sheets.

## Architecture

- **Jobs/bookings/evidence/activity**: MongoDB Atlas (`db/*.repo.ts`). Booking data
  still comes from Google Calendar (`google/calendar.ts`, unchanged) -- a background
  sync (`jobs/booking.service.ts`, run on an interval by `server.ts` and throttled
  on-demand by `jobs.service.ts`) parses Calendar events into Mongo the same way it
  used to write Sheets rows.
- **Driver roster** (initials, phone, van registration, active flag): stays in the
  Sheets "Drivers" tab, admin-managed via TMV-Chat-bot's Add/Edit Driver flow
  (`google/sheets.ts` here is read-only, trimmed to just that lookup).
- **Evidence photos** (arrival/loaded/empty-van/signature): Cloudinary
  (`storage/cloudinary.ts`), not Google Drive. Upload is synchronous -- the camera
  upload posts real bytes directly, so there's no Chat-attachment-relay step and no
  async queue/worker/reaper (all deleted; they existed only for that two-hop design).
  **Needs `CLOUDINARY_URL` set to actually work** -- until then the app runs fine,
  photo upload just fails with a clear "not configured" error.
- **Driver auth**: MongoDB (`auth/*.ts`) -- password login, forgot/reset password
  (email via Gmail, same domain-wide-delegation setup as TMV-Chat-bot), and the
  password-setup-link flow from TMV-Chat-bot's admin dashboard.
- **Customer emails** (job completion, review request, password reset): Gmail
  (`google/gmail.ts`, unchanged).

## Deliberately deferred / simplified from the original Chat-bot workflow

- **Parking Liability / Liability Report / Check In / Check Out scenario forms**:
  the original Chat bot's dedicated multi-step detour forms aren't built. Flagging an
  issue (`ISSUES_YES`) currently just resumes the same place `ISSUES_NONE` would --
  the driver still needs to report it separately (call/message) until these are
  built.
- **Customer-facing signature link**: the original design texted/emailed the customer
  a separate signature-pad link for their own device. This app instead has the
  driver hand their phone to the customer to sign in-app (`SignaturePad.tsx`).
- **Customer notification scheduling** ("your driver is arriving in 60 minutes"):
  not ported -- left entirely to TMV-Chat-bot, so a booking handled by both systems
  doesn't get the reminder sent twice.
- **Admin-editable settings** (crew rates, email templates): there's no admin UI in
  this project, so these are plain env config (`config/env.ts`) with the same
  fallback values the original always used, not live-editable.

## Local dev

```bash
# backend
cd backend && npm install && npm run dev   # listens on PORT (see .env)

# frontend (separate terminal)
cd web && npm install && npm run dev       # :3001, proxies /api and /healthz to :8090
```

Backend `.env` needs: `MONGODB_URI`, `GOOGLE_SHEETS_SPREADSHEET_ID` +
service-account credentials (Drivers-tab lookup + Calendar + Gmail),
`GOOGLE_CALENDAR_ID`, `DRIVER_SETUP_LINK_SECRET` (must match TMV-Chat-bot's value
exactly), `TMV_SIGNATURE_LINK_SECRET`, `CLOUDINARY_URL` (photo upload -- app runs
without it, just can't upload). See `config/env.ts` for the full list and defaults.

## Deployment

Live at `chat.themanvan.co.uk` on the same VPS as `dashboard.themanvan.co.uk`
(`2.57.90.26`), same pattern: `docker compose` + nginx + certbot. Redeploy with
`ssh root@2.57.90.26 "/opt/tmv-pwa/deploy/redeploy.sh"`.

## Not started yet

- Real app icons (`web/public/icons/README.md` documents exactly what's needed)
- The scenario forms and customer-facing signature link noted above
