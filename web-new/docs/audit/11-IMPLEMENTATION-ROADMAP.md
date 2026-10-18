# 11. Implementation roadmap

No time estimates: they would be guesses without the backend team's capacity and access.

| Stage | Objective | Scope | Depends on | Acceptance | Tests |
| --- | --- | --- | --- | --- | --- |
| 1 Stabilise | Close verified risks | B-01, B-02, B-03, B-04, B-05 | Backend access for 03 to 05 | No external push redirect; no runaway polling; replay-safe actions; rule tests | unit (helper, hook), backend integration |
| 2 Reliability | Make workflows and data trustworthy | pence/pounds unification, notification log, time and charge rule config, server aggregates | Stage 1 | Same totals in every module | contract tests, regression of reports |
| 3 Code quality | Reduce regression risk | ESLint, CI audit, retire classic admin, split `JobWorkflowScreen`, image optimisation | none | CI green, bundle not larger | existing suite plus lint |
| 4 UI system | Finish primitives | `Select`, `StatTile`, chart a11y, KPI click-through | Stage 3 helps | No native selects; axe clean | component + axe |
| 5 Workflow | Fewer steps | assignment with availability and conflicts, notify from more contexts | availability data | Dispatcher assigns without leaving Jobs | e2e (Playwright) |
| 6 Phase 2 | Internal booking and Payments | booking model, pricing engine port, payment records, reconciliation, Calendar sync or replacement | written requirements, Make.com rules exported | Booking to payment traceable | server and e2e |
| 7 Intelligence | Suggested drivers | location, availability, travel-time data | Stage 6 | Suggestions explain why | offline replay tests |
| 8 Hardening | Production readiness | monitoring, health checks, backup and restore test, rollback, headers, privacy review | all | checklist signed | load, security, restore drill |

Production-readiness checklist: authorisation matrix tested; CSRF/SameSite confirmed; rate limits on login and
reset; security headers; error monitoring; structured logs without personal data; backups with a tested restore;
rollback tested; push sender secured; retention policy for location and photos; dependency audit clean or
justified.
