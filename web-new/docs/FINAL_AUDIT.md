# TMV production audit (16 Oct 2026)

Scope: this repository (`talhaazhar-ta/projectnewTMV`), the frontend for the admin
dashboard and driver app. The Express/MongoDB backend, the Google Chat bot and the
production database live in other repositories and were **not** available to this
audit, so backend findings are traced from data and contracts and listed as backend
work, not claimed as fixed.

## 1. Executive summary

- The £898,990,077.80 MAN VAN "revenue handled" is caused by **one stored final
  charge**, not by aggregation: job `TMV-EBDA41133A` (13 Oct, MAN VAN) holds
  £898,988,888.00 against priced parts of £211.60. Correcting it needs an authorised
  database change (section 9). The dashboard now flags such jobs individually.
- The public preview has no backend and no route to production data. Its job
  references were real; they are now synthetic.
- Fixed in this audit: per-job final-charge check, honest legal-wording provenance on
  Liability PDFs, bulk reassign no longer offered for completed/cancelled jobs, server
  CSV exports report errors and session expiry instead of navigating away, "Not priced"
  uses pricing evidence, Van compliance shows due state instead of "Recorded", payment
  line uses the backend's own payment status, demo driver figures follow the range.
- Not fixable from this repository: historical search beyond 30 days for vans and
  liability, declaration snapshots at signing, report audit history, the bad stored
  value itself. Each has a concrete backend proposal below.

## 2. Verified repository state

| Item | Value |
| --- | --- |
| `main` before this audit | `3d0be4e` (merge of PR #20) |
| Baseline `npm run verify` on `main` | 147 test files, **959 tests passed**, 0 failed, 0 skipped; build OK; precache 2073 KiB (budget 2400) |
| Known build warnings | AdminApp chunk over 500 kB (expected, documented); `%VITE_ADMIN_HOSTNAMES%` placeholder notice (harmless) |
| Uncommitted changes at start | none |

## 3. PR and deployment status

| PR | Content | State | Preview deploy (`deploy-demo.yml`) |
| --- | --- | --- | --- |
| #18 | Driver Breakdown PDF | merged `390b2bd` | run 16 success |
| #19 | Global search | merged `9ffb82a` | run 17 success |
| #20 | Jobs redesign | merged `3d0be4e` | run 18 success |

`tmv.elevariq.tech` is the **preview** (demo build). There is no production deploy
pipeline in this repository; `dashboard.themanvan.co.uk` is served elsewhere and its
deployed revision cannot be read from here. The sandbox cannot reach either host, so
deploys are verified by workflow result and by running the same demo build locally.

## 4. Architecture (frontend)

One Vite + React 18 + TypeScript build ships the driver PWA and the admin dashboard
(dynamic import, kept out of the PWA precache by `scripts/adminChunks.ts`). Server
state through React Query; every admin call through `adminFetch` (cookies, 30 s timeout,
401 returns to sign-in). Routes are `?section=` values (`navigation.ts`), job detail is
an overlay (`?job=`). Themes: Aurora Light and true-black Midnight (`adminTheme.css`,
enforced by `adminTheme.test.ts`).

### Route inventory

| Route | Main components | Data source | Notes |
| --- | --- | --- | --- |
| Overview `section=overview` | `OverviewPage`, overview/* | `/api/admin/jobs` (paged), summary, attention sources | Generate report opens from `?report=generate` |
| Jobs `section=jobs` | `JobsPage`, `jobs/JobCard`, `DataTable` | `/api/admin/jobs` + per-status counts | Cards/Table, bulk bar, Add job modal |
| Job detail `job=` | `JobDetailDrawer` | `/api/admin/jobs/:id` | Reassign, finish manually, review, PDF |
| Live Fleet `section=livefleet` | `LiveFleetMap` | `/api/admin/fleet/live` | Map tiles need network |
| Drivers `section=drivers` | `DriverCards`, directory, performance | `/api/admin/drivers`, `/drivers/summary` | `view=cards|directory|performance` |
| Driver report `section=driverreport` | `DriverReportView`, report/* | `/api/admin/driver-reports/:initials` | Six tabs |
| Van `section=vehicles` | `VehiclesPage`, `VanPreview` | `/api/admin/van/drivers` | `vehicle=` preview |
| Liability `section=evidence` | `EvidencePage`, `PaperScenarioReport` | `/api/admin/scenarios/:kind` | `kind=checkin|checkout|parking|liability`, `record=` |
| Alerts `section=alerts` | `AlertsCenterPage`, `AlertsBell` | attention sources, notifications, GPS alerts | Mark all as read (local) |
| Settings `section=settings` | Settings tabs | `/api/admin/settings`, messages | pricing, templates, notifications, api |
| Data maintenance `section=maintenance` | Maintenance page | maintenance endpoints | Destructive actions confirmed |
| Global search (Ctrl/Cmd K) | `CommandPalette`, `search/*` | see `docs/SEARCH.md` | |
| Sign-in | `AdminLogin` | `/api/admin/login`, `/me` | |

Classic admin (`admin-classic/`) is not routed and not in the build.

## 5. Audited modules and results

Browser sweep (dev mock data): every section above at 1920, 1280, 768, 390 and 320 px
in Aurora Light and Midnight, 100 page loads. **Horizontal overflow: none. Console
errors: none**, except Live Fleet map tiles, which this sandbox cannot download
(environment, not code). Extra checks at 1440/1024/375 for Jobs, the palette and the
job drawer.

## 6. Security findings

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| S1 | Preview isolation. The demo build installs an in-browser mock for every `/api/` request (fetch and XHR); unknown endpoints return 501 in the browser. The host has no backend and `.htaccess` answers any `/api/` request with 503. Sign-in accepts any password **only inside that mock**; no session, cookie or token reaches a server. Production builds tree-shake `src/mocks/` out (`import.meta.env` constant). | — | Verified, no exposure |
| S2 | Preview job references were real production IDs (from the jobs export). Not personal data, but linkable to production records. | P2 | **Fixed**: replaced with one-way-hashed synthetic `TMV-D…` IDs. The old IDs remain in Git history (commit `d05a4af`); rewriting history needs a force push and is not done without your approval. |
| S3 | Server CSV exports navigated the window to `/api/...`: a 401 left the user on an error page instead of signing them out cleanly, a failure replaced the dashboard, and in the preview it showed a 503 page. | P2 | **Fixed**: `utils/serverDownload.ts` (adminFetch, 2 min timeout, content-type check, safe file name); preview mock serves CSV files. |
| S4 | Client CSV/XLSX formula injection | — | Verified guarded (`sanitizeCsvCell`, inline-string XLSX cells) |
| S5 | Recent search history | — | Verified: local only, ids and short labels, no customers, cleared on sign-out and expiry |
| S6 | Authorisation of search, exports and records | — | Enforced by the backend endpoints; not testable here. No new endpoint was added. |
| S7 | The supplied `old_web.zip` contains `web/.env.local` with a backend URL setting (no keys or passwords). | info | Do not commit it; nothing taken from it. |

## 7. Demo / production isolation

Preview data is fictional or anonymised: customer names, phones and street names are
fictional; only postcode districts are kept; job references are synthetic; dates are
relative to "today". Amounts, durations, statuses and payment methods follow the export
so the screens show realistic cases (including the £898m record). The preview cannot
call production: there is no API base URL in the build and every `/api/` call is
answered in the browser.

## 8. Financial integrity

Definitions kept apart in code and labels: final charges (billed at completion,
includes invoices) vs recorded receipts vs driver collected vs manual entries; saved job
road charges vs GPS estimates; scheduled vs working vs reported hours; missing is "Not
recorded"/"Not submitted", never £0.00.

Changes:
- **Final charge to check** (`finalChargeOutlier`, `hooks/useAttention.ts`): a completed
  job whose final charge is more than ten times its priced parts (base, extras,
  overtime, congestion, tunnel) and at least £1,000 more is listed under Needs
  attention and on the job card. The stored value is shown unchanged.
- **Not priced** (`isUnpriced`, `components/jobs/jobView.ts`): only a zero calculated
  charge with no base price and no billing rate reads "Not priced"; a zero with pricing
  evidence is shown as £0.00.
- **Payment line** uses the backend's `paymentStatus` when present, so a job recorded as
  "Card, Cash" no longer reads "payment not recorded" when the breakdown is per-method
  unknown.

## 9. MAN VAN anomaly (read-only diagnosis)

Source: the jobs export supplied on 16 Oct (production data, read only).

| Field | Value |
| --- | --- |
| Job | `TMV-EBDA41133A`, MAN VAN, booked 13 Oct 2026 15:00, status COMPLETED |
| Base price + extras + overtime | £180.00 + £31.60 + £0.00 = **£211.60** |
| Rate / source / billing | £55.00 per 30 min, calendar, verified |
| Stored total charges and amount charged | **£898,988,888.00** (both) |
| Actual minutes | 0.36 (about 22 seconds) |
| Payment methods | Card, Cash, Bank Transfer, Link |

The other MAN VAN completed jobs in 10–15 Oct sum to £1,189.80; £898,988,888.00 +
£1,189.80 = **£898,990,077.80**, exactly the card value. So aggregation, joins and
parsing are correct; the stored final charge is wrong (a keyed-in repeated digit), and the
22-second completion with all four methods suggests a test submission on the MAN VAN
account.

Proposed correction (needs your authorisation; nothing was changed):
- Original value: 89,898,888,800 pence on `amountCharged` (and the matching total).
- Proposed: either £211.60 (its priced parts) or exclude the job if it was a test.
- Evidence: table above; impact: MAN VAN revenue and any range total including 13 Oct.
- Rollback: keep the original value in an audit record before the update.
- Prevention (backend): reject a final charge above a sane ceiling or above N× the
  calculated charge without a confirmation and reason.

## 10. Jobs module

Verified cards and table (fields, route, driver initials, status, amount meaning,
attention), view persistence, filters, exact per-status counts, refresh, export, bulk
bar, job drawer. Fixed: bulk reassign skips completed/cancelled jobs and says so;
footer text shortened so it is not cut off at 320 px; full job reference in a tooltip.

## 11. Global search

Verified against `docs/SEARCH.md`: driver initials (T, TI, KA, HE, RF, WD), partial
references, registrations in any spacing, liability deep links, ranking, history
privacy, keyboard. Limitation remains: van and liability matching covers the last 30
days because those endpoints have no text search; the backend `/api/admin/search`
proposal with indexes is in `docs/SEARCH.md`.

## 12. Driver report and PDF

Six tabs present (Jobs, Performance & Timings, Payments, Comparison, Tunnel, Congestion).
The in-dashboard Driver Breakdown PDF (`reports/driverBreakdown.ts`) uses the server's
report totals and pages jobs by the server's page size (tested). The server's own
12-page export is still offered; its renderer is in the backend and was not audited.

## 13. Liability and legal documents

Each scenario prints its own wording from `scenarioSpec.ts` (mirrors the backend spec).
**Fixed**: the PDF previously said the wording was "the text shown to the customer",
which cannot be verified for older records. It now prints the wording stored with the
record when the record carries a `declarationSnapshot` (template id, version, exact
text), and otherwise states that the record does not store the signed wording and the
current template is shown.

Backend proposal: store `declarationSnapshot { templateId, version, text, sha256 }` on
every scenario and job-completion submission at signing time. Do not backfill history.

## 14. Van and compliance

**Fixed**: the compliance column said "Recorded" even when the MOT had expired. It now
shows the worst due state: Overdue, Due soon, Current, Partly recorded or Not recorded
(`complianceSummary`, tested).

## 15. GPS and road charges

The frontend displays the approved windows (tunnels every day 06:00–22:00; congestion
Mon–Fri 07:00–18:00 and Sat–Sun 12:00–18:00, London time) and uses the server's
`chargeable` decision per event; it does not compute charges. Missing tracker data is
shown with its reason, never as misconduct. Daylight-saving behaviour is a backend
responsibility (not testable here).

## 16. UI, mobile, themes, accessibility

Sweep results in section 5. Light and Midnight both checked; `adminTheme.test.ts`
enforces grey neutrals, AA contrast and no navy. Dialogs use `useDialogFocus`.

### Automated accessibility pass (axe-core 4.10, WCAG 2.2 AA + best practice)

Run over 20 views (every section, the job drawer, van preview, liability record, Generate
report, the palette) in both themes at 1440 and 390 px. Fixed:

| Rule | Where | Fix |
| --- | --- | --- |
| aria-tooltip-name | Shared tooltip element | Hidden from assistive tech while closed |
| color-contrast | Midnight nav group labels (3.9:1); danger buttons (3.7:1); van header text | `--nav-label` #808080 (5.3:1); new `--danger-solid` token (white text 4.8:1 and above) for `Button` and `Action` danger; van text full white |
| heading-order | Job cards, driver cards, comparison and road-charge sections | Card and section titles are `h2` under the page `h1` |
| page-has-heading-one | Data maintenance | Page `h1` added |
| dlitem | Overview "Today at a glance" | Valid `dl` (dt before dd), group label on a wrapper |
| scrollable-region-focusable | Palette results, drawer body, financial breakdown table | Keyboard-focusable with a visible ring |
| empty-table-header | Financial breakdown extra-charge rows | Screen-reader text on every row header |
| target-size | Job drawer phone/email links, "View charge rules", "Adjustment reason" | At least 24 px tall |
| landmark-no-duplicate-banner | Modal header, printed-report header | Not banner landmarks |
| region | Off-screen print copy | `aria-hidden` (screen readers read the on-screen copy) |

Remaining: Live Fleet map markers can overlap at 390 px (third-party Leaflet layer).

### Forced colours

`@media (forced-colors: active)` rules give selected chips, tabs, toggles, the current nav
item and selected job cards a `Highlight` outline, and cards a `CanvasText` border.
Checked by screenshot with Chromium's forced-colours emulation.

Not done: a manual pass with a real screen reader (NVDA/VoiceOver).

## 17. Tests

| Run | Files | Tests | Result |
| --- | --- | --- | --- |
| Baseline `main` | 147 | 959 | all passed |
| After this audit | 149 | 971 | all passed (`npm run verify`) |
| After accessibility pass | 149 | 974 | all passed (`npm run verify`) |

New regression tests: final-charge outlier, unpriced vs real zero, payment status line,
bulk reassign eligibility, server download (success, failure, wrong type), declaration
provenance, compliance summary.

Not executed: lint (the repo has no lint script; TypeScript strict mode is the static check), backend tests, real-device mobile,
production smoke tests (no access).

## 18. Unresolved

1. Stored £898,988,888.00 final charge: the owner asked for job `TMV-EBDA41133A` to be
   removed. It has been removed from the preview data; the production record must be
   deleted in the production dashboard (no backend access here).
2. Van/liability search older than 30 days (needs backend search).
3. Declaration snapshots at signing (backend).
4. Report generation history (needs backend audit table and authenticated identity).
5. Old real job IDs in Git history (needs approval for a history rewrite; low risk).
6. Manual screen-reader pass (automated pass and forced colours done, section 16).

## 19. Production readiness

The frontend is ready to ship with these changes. Production readiness of the whole
system also depends on items 1–4 above, which sit in the backend.
