/** @type {import('tailwindcss').Config} */

/* Colour tokens live as RGB channel triplets in src/styles/tokens.css. This wraps each
 * one so Tailwind opacity modifiers work: `bg-brand` -> rgb(var(--brand) / 1),
 * `bg-brand/10` -> rgb(var(--brand) / 0.1). */
const c = name => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ---- semantic system (new) ------------------------------------- */
        bg: c("--bg"),
        surface: {
          DEFAULT: c("--surface"),
          sunken: c("--surface-sunken")
        },
        line: {
          DEFAULT: c("--line"),
          strong: c("--line-strong")
        },
        fg: {
          DEFAULT: c("--fg"),
          muted: c("--fg-muted"),
          subtle: c("--fg-subtle")
        },
        brand: {
          DEFAULT: c("--brand"),
          hover: c("--brand-hover"),
          active: c("--brand-active"),
          fg: c("--brand-fg"),
          subtle: c("--brand-subtle"),
          "subtle-fg": c("--brand-subtle-fg"),
          line: c("--brand-line")
        },
        success: {
          DEFAULT: c("--success-fg"),
          signal: c("--success-signal"),
          subtle: c("--success-subtle"),
          line: c("--success-line")
        },
        warning: {
          DEFAULT: c("--warning-fg"),
          signal: c("--warning-signal"),
          subtle: c("--warning-subtle"),
          line: c("--warning-line")
        },
        danger: {
          DEFAULT: c("--danger-fg"),
          signal: c("--danger-signal"),
          subtle: c("--danger-subtle"),
          line: c("--danger-line")
        },
        info: { DEFAULT: c("--info-fg"), subtle: c("--info-subtle"), line: c("--info-line") },
        neutral: { DEFAULT: c("--neutral-fg"), subtle: c("--neutral-subtle"), line: c("--neutral-line") },

        /* The featured-job block — flat brand blue, white text. */
        "surface-dark": {
          DEFAULT: c("--surface-dark"),
          fg: c("--surface-dark-fg"),
          muted: c("--surface-dark-muted"),
          line: c("--surface-dark-line")
        },

        /* ---- @deprecated legacy aliases -------------------------------------
         * Kept so every un-migrated screen (incl. the admin dashboard) inherits the
         * new palette + dark mode. Removed per-file as screens are redesigned. */
        "brand-dark": c("--brand-active"),
        "brand-soft": c("--brand-subtle"),
        "admin-bg": c("--bg"),
        "admin-surface": c("--surface-sunken"),
        "admin-surface-2": c("--surface-sunken"),
        "admin-line": c("--line"),
        "admin-line-strong": c("--line-strong"),
        "admin-editable": c("--warning-subtle"),
        "admin-ink": c("--fg"),
        "admin-ink-2": c("--fg-muted"),
        "admin-muted": c("--fg-subtle"),
        "admin-brand": c("--brand"),
        "admin-brand-soft": c("--brand-subtle"),
        "admin-brand-dark": c("--brand-active"),
        "admin-status-green": c("--success-fg"),
        "admin-status-green-bg": c("--success-subtle"),
        "admin-status-amber": c("--warning-fg"),
        "admin-status-amber-bg": c("--warning-subtle"),
        "admin-status-red": c("--danger-fg"),
        "admin-status-red-bg": c("--danger-subtle")
      },

      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)"
      },

      /* Control heights + the centred app column, from tokens.css. */
      height: {
        "control-sm": "var(--control-h-sm)",
        control: "var(--control-h-md)",
        "control-lg": "var(--control-h-lg)"
      },
      minHeight: {
        tap: "var(--tap-target)",
        "control-lg": "var(--control-h-lg)"
      },

      fontSize: {
        /* ─────────────────────────────────────────────────────────────────
         * CANONICAL TYPE SCALE — named by role, not by size. Each entry ships
         * its line-height, weight and tracking, so one class sets the whole
         * treatment and hierarchy stays consistent across every screen.
         * Weights are fractional on purpose: Inter is a variable font.
         * ───────────────────────────────────────────────────────────────── */
        /** Completion headline, a standalone hero number (a price, a time). */
        display: ["27px", { lineHeight: "32px", letterSpacing: "-0.021em", fontWeight: "680" }],
        /** The one title per screen: page title, workflow step title. */
        title: ["21px", { lineHeight: "27px", letterSpacing: "-0.018em", fontWeight: "680" }],
        /** A heading *inside* a screen — groups a set of fields or cards. */
        heading: ["16px", { lineHeight: "21px", letterSpacing: "-0.012em", fontWeight: "640" }],
        /** Card title, and the primary line of a list row. */
        card: ["14.5px", { lineHeight: "19px", letterSpacing: "-0.008em", fontWeight: "620" }],
        /** Small ALL-CAPS section marker (PICKUP / DELIVER). Pair with uppercase. */
        eyebrow: ["11px", { lineHeight: "14px", letterSpacing: "0.055em", fontWeight: "620" }],
        /** Descriptive / paragraph copy. */
        body: ["14px", { lineHeight: "20px", letterSpacing: "-0.005em", fontWeight: "440" }],
        /** Field labels, and the secondary line of a list row. */
        label: ["13px", { lineHeight: "17px", letterSpacing: "-0.003em", fontWeight: "560" }],
        /** Helper text under an input; the quiet explanation. */
        helper: ["12.5px", { lineHeight: "17px", letterSpacing: "0", fontWeight: "440" }],
        /** Timestamps, counts, chip text — the smallest readable size. */
        meta: ["12px", { lineHeight: "15px", letterSpacing: "0.002em", fontWeight: "500" }],
        /** Shared button-label baseline (the Button component's md size). */
        button: ["14px", { lineHeight: "16px", letterSpacing: "-0.003em", fontWeight: "620" }],

        /* ---- aliases — keep un-migrated (admin) screens resolving ---------- */
        hero: ["30px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "page-title": ["21px", { lineHeight: "27px", letterSpacing: "-0.018em", fontWeight: "680" }],
        "section-title": ["16px", { lineHeight: "21px", fontWeight: "640" }],
        "card-title": ["14.5px", { lineHeight: "19px", fontWeight: "620" }],
        nav: ["12px", { lineHeight: "15px", fontWeight: "550" }],
        btn: ["13px", { lineHeight: "16px", fontWeight: "600" }],
        "body-sm": ["13px", { lineHeight: "18px", fontWeight: "440" }]
      },

      borderRadius: {
        /* Semantic radius (non-colliding with Tailwind's sm/md/lg/xl/2xl, which stay
         * available for un-migrated screens). */
        control: "var(--radius)",
        card: "var(--radius-md)",
        panel: "var(--radius-lg)",
        "card-lg": "var(--radius-card-lg)",
        module: "var(--radius-xl)",
        pill: "var(--radius-pill)"
      },

      maxWidth: {
        app: "var(--app-max-width)",
        content: "var(--content-max-width)"
      },


      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        dock: "var(--shadow-dock)",
        /* @deprecated legacy names -> new tokens */
        flat: "none",
        "2xs": "var(--shadow-xs)",
        primary: "var(--shadow-xs)",
        elevated: "var(--shadow-sm)",
        floating: "var(--shadow-md)"
      },

      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)"
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        DEFAULT: "var(--dur)",
        slow: "var(--dur-slow)"
      },

      // Keyframes referenced by the animation aliases in index.css.
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "zoom-in-95": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "slide-in-bottom": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "slide-in-top": { from: { opacity: "0", transform: "translateY(-16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "sheet-in": { from: { transform: "translateY(16px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        shimmer: { "100%": { transform: "translateX(100%)" } }
      },
      animation: {
        "fade-in": "fade-in var(--dur-slow) var(--ease-out) both",
        "zoom-in-95": "zoom-in-95 var(--dur-slow) var(--ease-out) both",
        "slide-in-right": "slide-in-right var(--dur-slow) var(--ease-out) both",
        "slide-in-bottom": "slide-in-bottom var(--dur-slow) var(--ease-out) both",
        "slide-in-top": "slide-in-top var(--dur) var(--ease-out) both",
        "sheet-in": "sheet-in var(--dur-slow) var(--ease-out) both",
        shimmer: "shimmer 1.6s infinite"
      }
    }
  },
  plugins: []
};
