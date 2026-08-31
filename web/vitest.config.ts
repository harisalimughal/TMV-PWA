import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Test config is kept separate from vite.config.ts so the PWA/service-worker plugin
 * never runs during unit tests. Only the React plugin is needed here, for JSX.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false
  }
});
