/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The driver-facing app's own brand blue -- kept as its own token (rather than
        // switching every CTA to admin-brand below) since it's TMV's actual brand
        // colour, not just a dashboard accent.
        brand: "#1B75BC",
        "brand-dark": "#155A94",

        // Ported verbatim from TMV-Chat-bot/dashboard/web/tailwind.config.js for
        // /admin (web/src/screens/admin/*) to render pixel-identical to that
        // dashboard's Login/Drivers/Settings screens. Also reused directly by the
        // driver-facing screens (LoginScreen, JobListScreen, JobWorkflowScreen, etc.)
        // for their own light theme -- the two apps deliberately share one visual
        // language now, so there's no reason to duplicate the same greys under a
        // second set of names. Still namespaced "admin-*" for history/searchability,
        // not because it's admin-exclusive.
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
      },

      // Also ported verbatim from the same dashboard config, for the same /admin-only
      // reason as the colors above. Only additions that can't collide with the driver
      // app's existing look: these fontSize/boxShadow keys aren't real Tailwind utility
      // names, and "pill" is a new borderRadius key -- none override an existing
      // default the way redefining borderRadius.lg/xl/DEFAULT globally would have, so
      // those three are deliberately left out (kept at their normal Tailwind values;
      // the /admin port's rounded-lg/rounded-xl/bare-rounded corners are a few px
      // softer than the source dashboard's as a result -- not worth the risk of
      // changing every rounded-* corner in the driver app to avoid).
      fontSize: {
        hero: ["32px", { lineHeight: "38px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "page-title": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "section-title": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "card-title": ["15px", { lineHeight: "20px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "450" }],
        nav: ["13px", { lineHeight: "16px", fontWeight: "500" }],
        btn: ["13px", { lineHeight: "16px", fontWeight: "600" }],
        label: ["12px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.01em" }],
        meta: ["11px", { lineHeight: "14px", fontWeight: "500", letterSpacing: "0.02em" }]
      },
      borderRadius: {
        pill: "9999px"
      },
      boxShadow: {
        flat: "none",
        primary: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        elevated: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        floating: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      }
    }
  },
  plugins: []
};
