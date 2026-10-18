# 06. Security assessment

Scope: frontend source, build and deploy configuration, dependency advisories. The backend, database, push
sender, production nginx and secrets management were **not available**; authorisation and session security can
only be assessed from the client's contract and are marked Unknown. No secrets were read or printed. No exploit
was attempted.

## Verified findings

| ID | Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- |
| S1 | Medium (P1) | Notification tap destination is navigated to without a same-origin check. A push payload with an external `url` sends the driver to that site (phishing risk). The worker also calls `clients.navigate(targetUrl)` and `openWindow(targetUrl)`. | `public/push-worker.js:144-166`; `src/components/driver/NotificationBell.tsx:87`; `src/components/InAppNotificationListener.tsx:95` | Resolve against `self.location.origin` / `window.location.origin`, accept same-origin paths only, fall back to `/`. Validate server-side in the broadcast route as well (the admin composer now validates client-side). |
| S2 | Low (P2) | Admin bundle (1.27 MB) is publicly downloadable from any host that serves the build; it reveals the admin API surface (endpoint names, UI), not secrets. The host check in `adminHost.ts` is not a security control. | `dist/assets/AdminApp-*.js`; `lib/adminHost.ts` | Acceptable if every admin API enforces server-side authorisation (Backend, **U**). Optionally serve the admin chunk only on the dashboard host. |
| S3 | Low (P2) | No security headers defined in repo deploy config: no CSP, frame-ancestors/X-Frame-Options, Referrer-Policy, Permissions-Policy. Production nginx config is not in the repo. | `deploy/hostinger/.htaccess` (caching and HTTPS redirect only) | Add headers in nginx and the preview `.htaccess`; start CSP in report-only mode (the app uses inline styles and Leaflet tiles). |
| S4 | Low (P2) | Dependency advisories: 8 (5 high, 3 moderate) from `npm audit`. One in production deps: `fflate` 0.8.0-0.8.2 (unzip ZIP64 loop). The app imports only `zipSync` (`reports/exporters.ts:10`), so the advisory is not reachable. Highs are build-toolchain (for example `braces`). | `npm audit` run 16 Oct | `npm audit fix` for fflate; review toolchain upgrades separately (do not force). Add `npm audit --omit=dev` to CI. |
| S5 | Low (P3) | Some requests bypass the shared transports (no timeout, no 401 handling): push subscribe/unsubscribe, outbox replay, public Nominatim lookups. | `lib/pwa/usePushNotifications.ts:49,79,96,127`; `lib/outbox.ts:140` | Route through `request`/`adminFetch` except the third-party call. |
| S6 | Info | No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` or `document.write` in source. Booking text is rendered as text (`RawBookingText`, `htmlText.ts`). | search of `src` | Keep a lint rule once ESLint exists. |
| S7 | Info | Local storage holds only preferences (theme, filters, read markers, PWA state). No tokens or personal data found. | `localStorage.setItem` search | none |

## Risks that need the backend (Unknown, not verified)

- Authorisation on each admin route; driver access limited to own jobs (the Activity contract specifies this;
  nothing enforces it until the backend does).
- CSRF: the client sends no CSRF token; protection depends on cookie `SameSite` and server checks.
- Rate limiting and brute-force protection on login and reset; password policy; session lifetime and rotation.
- Push sender: who may call `/api/push/admin/broadcast`, recipient resolution by `driverInitials`, logging of body text.
- Personal data in logs, retention of GPS history and photos, deletion procedures, processor list (UK GDPR review
  by a specialist; the code cannot show compliance).
- Direct-object access to evidence files and report downloads (`/api/admin/*/export.csv`, photos).
- Realtime subscription authorisation: not applicable today (polling only).

## Recommended security tests

Authorisation matrix test per role and route against a staging backend; header scan; dependency audit in CI;
SAST for the push worker; DAST on the staging admin host; privacy review of location and photo retention.
