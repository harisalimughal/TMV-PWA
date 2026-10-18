# 10. UI/UX modernisation plan

The visual base is already coherent (Aurora Light, true-black Midnight, tokens, shared primitives). The plan is
to finish the system, not restyle it.

1. **Primitives first** (`ds/`): `Select`, `StatTile`, `ModalHeader`, `EmptyState` variants, `DataTable` density
   setting. Replace native selects and hand-built KPI tiles page by page. Acceptance: no native `<select>` in a
   toolbar; every KPI uses `StatTile`.
2. **Typography and numerals**: keep Hanken Grotesk; use tabular numerals for all money and times (already used in
   cards); define three sizes for labels (12, 12.5, 13) instead of the current mix of 11.5 to 13.5. Acceptance: a
   lint-free list of allowed text sizes in `tailwind.config.js`.
3. **Spacing**: adopt a 4 px scale (4, 8, 12, 16, 24, 32) and remove one-off values during page work, not in a bulk
   rewrite.
4. **Colour**: no change to tokens. Extend CHART tokens with a colour-blind-safe sequence and a pattern/label
   fallback for status charts (accessibility).
5. **Charts**: keep time-series as lines/areas; use donut or radial only for part-to-whole status and single-value
   progress. Add a "view as table" toggle for screen readers.
6. **Cards**: job and driver cards now follow the reference structure; apply the same header/footer anatomy to Van
   cards if introduced. Keep one card chrome (`tmv-job-card`, `tmv-gloss`).
7. **Activity**: keep the chat-like timeline; add per-event icons by category (not colour only) and a filter chip
   row on narrow screens; keep "Notify Driver" wording; never show ticks or presence.
8. **Forms**: composer fields show helper text and inline validation (done); apply to Add job and Add driver.
9. **Responsive**: cards collapse to one column below 640 px (done); tables fall back to cards on phones for
   Delivery log (done) and Jobs (verify).
10. **Dark mode**: continue to test each new surface in Midnight through the token tests and a manual pass.

Sequence: primitives, then Overview (KPI tiles and click-through), then Jobs/Drivers polish, Activity icons,
chart accessibility, last the Phase 2 screens built directly on the finished primitives.
