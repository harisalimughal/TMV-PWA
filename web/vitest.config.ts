import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Test config is kept separate from vite.config.ts so the PWA/service-worker plugin
 * never runs during unit tests. Only the React plugin is needed here, for JSX.
 *
 * `virtual:pwa-register` is a vite-plugin-pwa virtual module that only exists during a
 * real Vite build/dev, so it's aliased to a small stub for tests.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "virtual:pwa-register": fileURLToPath(
        new URL("./src/test/stubs/pwa-register.ts", import.meta.url)
      ),
    },
  },
  test: {
    maxWorkers: 4,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.ts"],
    // CSS is stubbed in tests, except the admin theme, which adminTheme.test.ts reads as text.
    css: { include: [/adminTheme\.css/, /bookingTheme\.css/] }
  }
});
