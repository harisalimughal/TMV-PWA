# Deployment

The app builds to static files. Hosting it means serving `dist/` and routing `/api` to the
backend **on the same domain**.

## 1. Build

```bash
npm ci
npm run verify        # typecheck, tests, build, precache check
# output: dist/  (index.html, assets/, sw.js, workbox-*.js, manifest.webmanifest, icons, push-worker.js)
```

No environment variables are needed for a production build. Optional build-time settings:

| Variable | Use |
| --- | --- |
| `VITE_ADMIN_HOSTNAMES` | Extra hostnames (comma-separated) that should show the admin dashboard, e.g. a staging domain. `dashboard.themanvan.co.uk` is always included. |
| `VITE_BUILD_ID` | Build id shown in PWA Settings (defaults to the git short SHA). |

## 2. Hosting requirements

1. **Same origin as the API.** The app calls `/api/...` with same-origin cookies
   (`credentials: "same-origin"`). The domain that serves `dist/` must also route `/api/` to the
   Express backend, usually with an nginx reverse proxy. A separate API domain will not work
   without code and cookie changes. (`/healthz` is the backend's health check; the app itself
   does not call it, only the dev server proxies it.)
2. **HTTPS.** Required for the service worker, install prompt, push notifications, camera and
   location.
3. **SPA fallback.** Any path that is not a file and not `/api/` must return `index.html`.
4. **Caching.**
   - `/assets/*`: file names contain a content hash, cache for a year (`immutable`).
   - `index.html`, `sw.js`, `workbox-*.js`, `push-worker.js`, `manifest.webmanifest`: `no-cache`,
     so drivers receive updates. A stale `sw.js` keeps phones on the old version.
5. **Which app shows where.** The same `dist/` serves both products:
   - `dashboard.themanvan.co.uk` (and any `VITE_ADMIN_HOSTNAMES` host): Aurora admin dashboard on
     every path.
   - Any other host (for example `chat.themanvan.co.uk`): driver app at `/`; `/admin` redirects to `/`.
   - `/temp` (the retired classic admin URL) redirects to `/` on every host. The classic admin
     code is still in `src/screens/admin-classic/` but nothing routes to it.

## 3. Example: nginx on the VPS

The backend already runs on a VPS behind nginx. Adjust names, paths and the backend port to the
real server; the values below are placeholders to check against the current nginx config.

```nginx
# /etc/nginx/sites-available/tmv-web  (one server block per domain, or list both names)
server {
    listen 443 ssl http2;
    server_name dashboard.themanvan.co.uk chat.themanvan.co.uk;

    # ssl_certificate / ssl_certificate_key: keep the existing certbot lines

    root /var/www/tmv-web/current;   # symlink to the active release (see below)
    index index.html;

    # API and health check go to the Express backend (use its real port).
    # proxy_read_timeout: the admin factory reset can run for minutes (the app waits up to
    # 10 minutes for it); nginx's default of 60 s would cut it off with a 504.
    location /api/   { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host;
                       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                       proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 25m;
                       proxy_read_timeout 600s; }
    location = /healthz { proxy_pass http://127.0.0.1:8080; }

    # Hashed build assets: cache for a year
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }

    # Files that must never be cached
    location ~ ^/(sw\.js|workbox-.*\.js|push-worker\.js|manifest\.webmanifest|index\.html)$ {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    # SPA fallback (index.html for app routes, revalidated on every load)
    location / { add_header Cache-Control "no-cache"; try_files $uri $uri/ /index.html; }
}
```

`client_max_body_size` matters for driver photo uploads; keep whatever the current config uses.

## 4. Releasing (manual)

Keep each build in its own folder and switch a symlink, so a rollback is one command.

```bash
# on your machine or in CI
npm ci && npm run verify
tar -czf tmv-web-$(git rev-parse --short HEAD).tgz -C dist .

# on the server
REL=/var/www/tmv-web/releases/$(date +%Y%m%d-%H%M%S)
mkdir -p "$REL" && tar -xzf tmv-web-<sha>.tgz -C "$REL"
ln -sfn "$REL" /var/www/tmv-web/current     # nginx serves the new build immediately
```

Rollback: point `current` back at the previous folder in `releases/`.

## 5. After each deploy

1. `https://dashboard.themanvan.co.uk/api/admin/me` returns a JSON response from the backend
   (for example 401 when signed out), not the app's HTML page. That proves `/api/` routing.
2. `https://dashboard.themanvan.co.uk/` shows the admin sign-in; sign in and open Overview, Jobs and Live fleet.

**To confirm with the backend before go-live:** when a photo has no `thumbProxyUrl`, the admin
fall back to `/admin/api/jobs/:jobId/photos/:fileId`. The nginx example above does not proxy
`/admin/api/`, so that fallback would load `index.html` instead of the photo. Either the backend
always sends `thumbProxyUrl`, or add `location /admin/api/ { proxy_pass ...; }` to match the
backend's real route.
3. The driver app loads at the driver domain. Phones show "Update available" for the new
   version (the service worker waits for the driver to accept, so nobody is interrupted mid-job).
4. Browser devtools, Network: `sw.js` is served with `Cache-Control: no-cache`.

## 6. Automating with GitHub Actions (optional)

CI (`.github/workflows/ci.yml`) already builds and tests every push to `main` and every pull request. To deploy
from GitHub as well, add a workflow that runs after CI on `main`, builds, copies `dist/` to the
server over SSH (for example with `rsync`) into a new release folder, and switches the
`current` symlink. Store the host, user and private key as repository secrets
(`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`), never in the repository.

## Preview on Hostinger (tmv.elevariq.tech)

A demo of the driver app (at `/`) and the Aurora admin (at `/admin`) with **fictional mock data
and no backend**, hosted on Hostinger (elevariq account) at `https://tmv.elevariq.tech`. The
in-repo mock API answers every `/api/` call in the browser, so sign-in accepts any password
and nothing there touches real TMV data. `/temp` redirects to `/`.

- **Build flags.** `VITE_DEMO_MOCK=true` ships the mock API (`src/mocks/`) in the build;
  `VITE_PATH_ADMIN_HOSTNAMES=tmv.elevariq.tech` makes that host path-gated like `localhost`.
  Never set `VITE_DEMO_MOCK` for a real deploy. Without it, the build contains no mock code.
- **Pipeline.** `.github/workflows/deploy-demo.yml` runs on every push to `main`: `npm run verify`,
  then the preview build, the precache check, copies `deploy/hostinger/.htaccess` (HTTPS redirect,
  `/api/` 503 as a fallback, `/temp` redirect, SPA fallback, cache headers) into `dist/`, and uploads `dist/`
  with `rsync` over SSH to `~/domains/tmv.elevariq.tech/public_html/` (new files first, then
  stale ones removed). Run it by hand from the Actions tab (`workflow_dispatch`).
- **Hostinger.** Website `tmv.elevariq.tech` (PHP/HTML, Cloud Enterprise plan, elevariq account).
  SSH details are in hPanel under Advanced, SSH Access. Repository secrets: `DEPLOY_HOST`,
  `DEPLOY_PORT`, `DEPLOY_USER`, and `DEPLOY_SSH_KEY` (a private key whose public half is in
  hPanel's SSH keys). Hostinger's own Git deploy is not used: its GitHub link is on another
  account that cannot see this private repo. SSL is the free certificate.
- **State.** The mock store is in memory, so changes made in the demo reset on reload.
- **Real data.** To show real data there, drop `VITE_DEMO_MOCK`, point `/api/` at a backend you
  are allowed to use (replace the 503 rule with a proxy) and agree it with the backend owner first.

## Staging

To try a build on another domain before switching production, build with that domain in
`VITE_ADMIN_HOSTNAMES` (so the admin shows there), serve it with the same nginx pattern, and
route its `/api/` to a backend you are allowed to test against.
