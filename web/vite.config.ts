import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // injectManifest not used -- generateSW covers the offline-shell caching this app
      // needs (static assets, app shell). Real-time chat data is never cached this way,
      // it's always live from the network.
      strategies: "generateSW",
      // TODO(pwa): add includeAssets: ["favicon.ico"] once a real one exists in public/.
      manifest: {
        // TODO(pwa): replace with real 192/512 + maskable icons once the client
        // provides brand assets -- see public/icons/README.md.
        name: "TMV Driver",
        short_name: "TMV Driver",
        description: "The Man Van driver app -- jobs, messages, and evidence photos.",
        start_url: "/",
        display: "standalone",
        background_color: "#F6F8FB",
        theme_color: "#F6F8FB",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Never cache API calls -- job/message data must always be live, not a stale
        // cached response. Only the built app shell (JS/CSS/HTML) gets precached.
        navigateFallbackDenylist: [/^\/api\//],

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
