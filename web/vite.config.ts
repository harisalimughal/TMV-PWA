import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* ---- version / build identity ------------------------------------------------
 * Single source of truth for the version shown in PWA Settings: package.json.
 * The build id is the git short SHA, falling back to the build date, then "dev".
 * Both are exposed to the app as compile-time globals (see src/lib/pwa/version.ts).
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8")
) as { version: string };

function resolveBuildId(): string {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt", not "autoUpdate": a new service worker installs and then WAITS, so
      // the app can surface an explicit "Update available / Update Now" flow (see
      // src/lib/pwa/registration.ts and src/app/UpdateBanner.tsx) instead of the page
      // silently changing under the driver mid-job. The virtual:pwa-register module is
      // imported by the registration singleton; injectRegister "auto" then no-ops.
      registerType: "prompt",
      injectRegister: "auto",
      // injectManifest not used -- generateSW covers the offline-shell caching this app
      // needs (static assets, app shell). Real-time chat data is never cached this way,
      // it's always live from the network.
      strategies: "generateSW",
      // TODO(pwa): add includeAssets: ["favicon.ico"] once a real one exists in public/.
      manifest: {
        // TODO(pwa): replace with real 192/512 + maskable icons once the client
        // provides brand assets -- see public/icons/README.md.
        id: "/",
        name: "TMV Driver",
        short_name: "TMV Driver",
        description: "The Man Van driver app -- jobs, evidence photos and customer sign-off.",
        lang: "en-GB",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // minimal-ui only kicks in where standalone isn't granted — harmless progressive
        // enhancement. window-controls-overlay is deliberately omitted: the app has no
        // draggable title bar region to support it.
        display_override: ["standalone", "minimal-ui"],
        categories: ["business", "productivity", "utilities"],
        // Light-theme product: the install splash + task-switcher chrome match the
        // light app bar (#FFFFFF) on a slate-50 ground (#F8FAFC).
        background_color: "#F8FAFC",
        theme_color: "#FFFFFF",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        // Long-press the installed icon → jump straight to a section. Routes the app
        // already honours via ?tab= (see src/App.tsx).
        shortcuts: [
          {
            name: "Today's jobs",
            short_name: "Jobs",
            url: "/?tab=jobs",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "Storage",
            short_name: "Storage",
            url: "/?tab=storage",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "Profile",
            short_name: "Profile",
            url: "/?tab=profile",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
          }
        ]
      },
      workbox: {
        // The app shell is an SPA: unknown navigations fall back to the built
        // index.html so a deep link / refresh works offline...
        navigateFallback: "index.html",
        // ...but never for API routes -- job/message data must always be a live
        // network response, never a cached HTML shell or a stale payload.
        navigateFallbackDenylist: [/^\/api\//],

        // No runtimeCaching: authenticated and user-specific responses
        // (jobs, account, uploads) are deliberately never written to a cache, so one
        // driver's data can never be served to another. Only the precached, versioned
        // app shell below is stored.

        // Precache the app shell AND the Inter woff2, so the typeface is present on
        // first offline launch with no fallback flash.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

        // The admin dashboard is a separate lazy chunk (~920kB) that no driver ever
        // opens. Without this it still got precached on install, so every driver
        // downloaded it in the background even though it's no longer in their initial
        // bundle -- which would have thrown away most of the benefit of splitting it.
        // The dashboard runs on desktop and fetches its chunk on demand.
        //
        // The non-latin Inter subsets (Cyrillic / Greek / Vietnamese / latin-ext) are
        // ignored too: the UI is English, so they'd only ever sit unused in the
        // cache. They still load straight from the network on the rare name that
        // needs them.
        globIgnores: [
          "**/AdminApp-*.js",
          "**/AdminApp-*.css",
          "**/inter-cyrillic*",
          "**/inter-greek*",
          "**/inter-vietnamese*",
          "**/inter-latin-ext*"
        ]
      }
    })
  ],
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:8090",
        changeOrigin: true
      },
      "/healthz": {
        target: "http://localhost:8090",
        changeOrigin: true
      }
    }
  }
});
