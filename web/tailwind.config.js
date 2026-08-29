/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The driver-facing app's own brand blue -- unrelated to (and must stay
        // independent of) the admin palette below, which ports TMV-Chat-bot's
        // dashboard tokens verbatim for the /admin screens only.
        brand: "#1B75BC",
        "brand-dark": "#155A94",

        // Ported verbatim from TMV-Chat-bot/dashboard/web/tailwind.config.js, so
        // /admin (web/src/screens/admin/*) renders pixel-identical to that dashboard's
        // Login/Drivers/Settings screens. Namespaced under "admin-*" so it can never
        // collide with the driver app's own `brand` above.
        "admin-bg": "#F8FAFC",
        "admin-surface": "#F1F5F9",
        "admin-line": "#E2E8F0",
        "admin-ink": "#0F172A",
        "admin-ink-2": "#475569",
        "admin-muted": "#64748B",
        "admin-brand": "#2563EB",
        "admin-brand-soft": "#EFF6FF",
        "admin-brand-dark": "#1D4ED8",
        "admin-status-green": "#10B981",
        "admin-status-green-bg": "#ECFDF5",
        "admin-status-amber": "#F59E0B",
        "admin-status-amber-bg": "#FFFBEB",
        "admin-status-red": "#EF4444",
        "admin-status-red-bg": "#FEF2F2"
      }
    }
  },
  plugins: []
};
