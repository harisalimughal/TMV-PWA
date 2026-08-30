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
        background_color: "#F8FAFC",
        theme_color: "#F8FAFC",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Never cache API calls -- job/message data must always be live, not a stale
        // cached response. Only the built app shell (JS/CSS/HTML) gets precached.
        navigateFallbackDenylist: [/^\/api\//]
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
