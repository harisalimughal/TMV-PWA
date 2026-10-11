# Concise Driver Breakdown PDF

Implemented locally on 2026-10-11. No database/provider access, source-data changes, push or deployment.

- PDF-specific explicit projection replaces the exhaustive audit projection. Sections match the six visible report tabs: Performance, Payments, Jobs, Comparison, Tunnel Charges and Congestion Charges.
- Landscape A4 tables retain selected-driver/date totals, all matching jobs, collections and adjustment reasons, working/allocated/overtime timings, helper/review data, manual comparisons and GPSLive zone records with timestamps, fees and rate sources.
- Removed graphs, raw event/visit metadata, JSON snapshots, authority diagnostics, technical notes, prepayment audit blocks, signed/excess reconciliation sections and the removed liabilities section. The comprehensive Excel projection is unchanged.
- Payment-method totals are included; invoices remain uncollected. Missing/incomplete manual data is labelled rather than hidden or treated as zero. Saved job fees and GPSLive-calculated charges remain separate, not added twice.
- Export still uses the full selected range, independent of screen pagination. Repeated table headings, measured wrapping, oversized-row continuation, real page numbering and existing capacity refusal protect output completeness. Empty reports use one page.
- Synthetic 3/105/0-job PDFs generated. Six-page small sample and empty/long-field continuation pages visually reviewed; all 105 IDs and long-field tail retained. PDF sample has zero graph curves, no internal audit fields and correct footers.
- Backend build and 15 PDF/model/export-route tests passed. The previously blocked frontend report/preview/navigation checks also passed: 49 tests across 7 files. No real-data download performed in this task.

Synthetic example: output/pdf/driver-breakdown-clean-sample.pdf.
