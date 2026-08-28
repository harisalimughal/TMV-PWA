# TMV Driver PWA

Mobile-first installable PWA for drivers, intended for `chat.themanvan.co.uk`.
Separate project from `TMV-Chat-bot` (which keeps running unchanged as the admin
dashboard + existing Google Chat bot) -- this reuses that project's Google
Sheets/Drive integration and job/workflow logic as a starting foundation, copied in
(not shared by reference) so the two projects can evolve independently.

## Status (scaffold only -- not a working app yet)

**Backend (`backend/`)** -- builds and typechecks. Verified live against the real
production Google Sheet (see `GET /api/debug/jobs`, a temporary smoke-test route --
remove once real routes exist).

Copied in from `TMV-Chat-bot/src` and `dashboard/server/normalize` + `read`:
Google Sheets/Drive/Calendar/Gmail integration, job/workflow engine, evidence
pipeline, the normalize layer, queue/task handling, utils. **Not** copied: the
Google Chat controller/card protocol (`src/chat/`), the admin dashboard itself, or
GPSLive fleet tracking -- none of that applies here.

One real gap flagged in code (`google/drive.ts`, search `TODO(pwa)`): the evidence
pipeline currently assumes photos arrive via Google Chat's attachment/media format.
The new camera-upload flow needs a second path (or a shared abstraction) once that
endpoint is designed -- not done yet.

**Frontend (`web/`)** -- builds cleanly, PWA service worker/manifest generate
correctly (verified: `npm run build` produces `sw.js`, `workbox-*.js`,
`manifest.webmanifest`). Currently just a placeholder screen that proves the shell
(safe-area handling, keyboard-safe `100dvh` layout, backend connectivity check) --
not the real chat interface.

## Not started yet

- Chat UI (conversation list, message bubbles, everything in the client spec's
  section 6)
- Driver authentication (nothing reused here -- drivers never logged into
  `TMV-Chat-bot` directly, only via their Google account inside Chat)
- MongoDB (message/conversation storage) -- deferred per explicit instruction
- Camera capture + upload endpoint
- Real app icons (`web/public/icons/README.md` documents exactly what's needed)
- Deployment (new nginx vhost + SSL for `chat.themanvan.co.uk`, docker-compose,
  the same pattern already set up for the dashboard)

## Local dev

```bash
# backend
cd backend && npm install && npm run dev   # listens on PORT (see .env)

# frontend (separate terminal)
cd web && npm install && npm run dev       # :3001, proxies /api and /healthz to :8090
```

Backend needs a `.env` -- same shape as `TMV-Chat-bot/.env.example` for the Google
credential fields (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
etc.), since it reuses that same integration layer.
