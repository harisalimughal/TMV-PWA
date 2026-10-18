# 01. Executive summary

## Overall assessment

The frontend is in good shape for a product at this stage: three products from one build, strong typing (no
`@ts-ignore`, one `tsc` pass in CI), 166 test files and 1162 passing tests, a deliberate offline design for the
driver app, explicit data-honesty rules (missing is never shown as zero), and a build-time guard that keeps the
admin code out of the drivers' offline cache. The weaknesses are mostly **outside the frontend**: almost every
rule that decides money, time, assignment, authorisation and notification delivery lives in the backend, which
this audit could not see. The frontend can be only as correct as the contracts it consumes.

**Production readiness: the frontend is releasable; the system as a whole cannot be rated** until the backend
checks in section "What must be verified next" are done. The demo (tmv.elevariq.tech) runs entirely on fictional
mock data and says so.

## Major strengths (verified)

- Typed, tested transport: every admin call goes through `adminFetch` (`src/lib/adminTransport.ts`) with
  timeout, calm errors and a 401 handler; driver calls through `src/lib/http.ts`. Cookie sessions, `credentials: "same-origin"`.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `document.write` anywhere in `src` (searched).
- Driver app: photos and signatures queue offline (`src/lib/outbox.ts`); workflow steps deliberately do not,
  to avoid replaying a state machine out of order; double-tap guard in `JobWorkflowScreen.tsx` (ref, line 281).
- Honest numbers: calculated, final and received amounts are separate; a single mistyped charge is flagged per job.
- Precache guard (`scripts/check-precache.mjs`) keeps the 1.27 MB admin chunk out of drivers' devices.
- Both themes follow tokens with automated contrast and "no navy" tests (`adminTheme.test.ts`).

## Major weaknesses and risks

1. **Unvalidated notification destination (P1, verified).** `public/push-worker.js:144-166`,
   `src/components/driver/NotificationBell.tsx:87` and `src/components/InAppNotificationListener.tsx:95` navigate to
   `data.url` from the push payload with no same-origin check. Whoever can send a push can send a driver to any site.
   The admin composer now validates the URL (`utils/notificationDestination.ts`), but that is client-side only.
2. **Activity polling against a server without the endpoints (P1, verified, my own code).**
   `useActivityUnread` (`hooks/useActivity.ts:22-31`) polls every 30 s and the nav badge mounts for every admin
   session; on a server that answers 404/501 it keeps polling forever. Needs "stop when unavailable".
3. **No client idempotency on driver actions (P1 risk, Backend to confirm).** `sendAction` (`src/api/jobs.ts:325`)
   posts `{action, input}` with no request id. Duplicate completion depends entirely on the server state machine.
4. **Business rules are not testable here (P1, Unknown).** Billing time rounding, driver-payable time, tunnel and
   congestion windows and their charges are computed in the backend; the frontend only displays `timeBilling`
   (`src/api/jobs.ts:6-18`) and hard-codes the charge-window wording in `RoadChargesTab.tsx:24-25`.
5. **17,321 lines of unrouted classic admin code (P2).** Still compiled, still tested (47 test files), referenced
   only by mock data and a comment in `adminHost.ts`. A maintenance cost with no users.
6. **No linter (P2).** There is no ESLint config; 63 uses of `any` outside tests and mocks.
7. **No security headers in the repository's deploy config (P2, Unknown for production).** `deploy/hostinger/.htaccess`
   sets caching only; production nginx is documented in `docs/DEPLOYMENT.md` but is not in the repo.
8. **Dependency advisories (P2).** `npm audit`: 8 findings (5 high, 3 moderate). One is in a production dependency
   (`fflate`, moderate, unzip-only; the app only calls `zipSync`, so not reachable). The highs are in the build
   toolchain (for example `braces`).

## Most important opportunities

Wire the already-built Activity and Notify Driver screens to a real backend; add server-side validation of
broadcast recipients and destinations; define time and charge rules as tested, versioned code or configuration;
retire or archive the classic admin; add a linter and an accessibility test layer; build Payments and the internal
booking system (Planned, Phase 2) on the existing contracts.

## What must be verified next (needs the backend)

Authorisation on every `/api/admin/*` and `/api/jobs/*` route; session and CSRF settings; push sender validation;
state-machine rules and idempotency; time and charge calculations; indexes and transactions; backups and
restore; rate limiting; logging of personal data; retention of location data.

## Immediate attention

P1 items 1 to 4 above, then `12-IMMEDIATE-ACTION-PLAN.md`.
