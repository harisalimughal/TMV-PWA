# TMV audit, 16 Oct 2026: index

Entry point for the audit documents. Read `01-EXECUTIVE-SUMMARY.md` first.

**Scope and honesty.** This repository is the frontend (admin dashboard "Aurora", the driver PWA, and a demo
mock API). The Express/MongoDB backend, the Google Chat bot, Make.com automations, the Calendar browser
extension, the website booking form, the GPS tracker integration and production nginx/server config are **not in
this repository and were not available**. Everything about them is marked Unknown or Backend, never
"verified". The previous audit (`docs/FINAL_AUDIT.md`, 16 Oct) covered financial and legal correctness of the
dashboard; this one does not repeat it and builds on it.

**Checks actually run** (commands and results in `07-PERFORMANCE-AUDIT.md` and `06-SECURITY-AUDIT.md`):
`npm run verify` (typecheck, 1162 tests, production build, PWA precache guard: all passed on `main` at
`d0f0d43`), `npm audit`, targeted source searches, and the browser inspections done earlier in this
engagement (admin and driver, light and dark, 1440 to 390 px, mock data only).

| File | Content |
| --- | --- |
| `01-EXECUTIVE-SUMMARY.md` | Overall assessment, strengths, risks, production readiness, next steps |
| `02-APPLICATION-INVENTORY.md` | Every module, status, dependencies, limits; data-flow map |
| `03-UI-UX-AUDIT.md` | Screen-by-screen findings, design system, themes, accessibility |
| `04-TECHNICAL-ARCHITECTURE.md` | Architecture, state, realtime, deployment, testing, maintainability |
| `05-FUNCTIONAL-GAP-ANALYSIS.md` | Working, partial, missing, planned, unknown, per requirement |
| `06-SECURITY-AUDIT.md` | Verified findings, risks needing the backend, privacy items |
| `07-PERFORMANCE-AUDIT.md` | Measured and predicted performance, with the difference stated |
| `08-DATABASE-AND-DATA-INTEGRITY.md` | What can and cannot be assessed without the backend; integrity risks |
| `09-IMPROVEMENT-BACKLOG.md` | Verified issues register and prioritised backlog (P0 to P3) |
| `10-UI-UX-MODERNIZATION-PLAN.md` | Design-system and polish plan |
| `11-IMPLEMENTATION-ROADMAP.md` | Staged plan with dependencies and acceptance criteria |
| `12-IMMEDIATE-ACTION-PLAN.md` | Top ten actions and the starting point |

Status words used throughout: **Implemented**, **Partial**, **Missing**, **Planned** (documented, not yet
required), **Unknown** (cannot be verified from this repository), **Backend** (belongs to another repository).
