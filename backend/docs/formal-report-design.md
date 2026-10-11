# Consistent company report design

Implemented locally on 2026-10-10. No database/provider access, push or deployment.

## Shared presentation

- Finished-job dossier, legacy job preview and all four scenario previews use the same first-page logo/title/reference header, labelled driver/record metadata, Europe/London footer and page numbering.
- Full job/submission references replace abbreviated display references. Scenario reports explicitly include their related job ID.
- Neutral white evidence/signature frames, consistent typography, margins, table rules and restrained notice styling replace coloured driver badges and decorative pill-shaped metadata.
- Photographs/signatures remain uncropped; financial values, notice wording, source timestamps and evidence ordering are preserved. The earliest job-evidence page now retains summary details even when an earlier scenario precedes it.
- Preview and browser PDF print source share renderers and content. Report-specific print rules restore headers hidden by the generic app print stylesheet and remove fixed-height overflow clipping.
- Oversized browser content may continue onto another physical page; displayed evidence-page numbering is logical report numbering. Exact physical pagination for extreme records needs native browser review.

## Server PDF summary

- The older hand-written one-page binary PDF has been replaced with the existing PDFKit dependency, wrapping fields and paginating instead of overlapping/clipping fixed coordinates.
- The download route awaits the generated buffer. Original summary information and money formatting remain; the API summary does not gain the dossier's photo/signature images.
- Header, colours, spacing, references and footer use the same company-report design language. PDF footer numbering reflects actual generated pages.
- The unsupported claim "Official Immutable Record" was removed. These changes provide professional presentation, not legal certification, proof of authenticity or an assessment of the notice wording.

## Verification

- Backend full regression: 508 tests/53 files passed. Frontend full regression: 250 tests/56 files passed before five additional consistency assertions; final focused report tests passed. Frontend build and backend TypeScript checks passed.
- Synthetic liability desktop and parking mobile (390 x 844) previews visually inspected; loaded photos/logo/signature and matching preview/print content checked.
- The synthetic two-page server PDF was rendered to images and both pages visually reviewed, with footer count/text and preserved figures checked. Long-content PDF generation tests passed without source mutation.
- Native browser Save as PDF and physical printing remain client acceptance checks, especially for photo-heavy dossiers and unusually long fields.
- Synthetic sample: output/pdf/job-report-design-sample.pdf. Isolated preview: http://127.0.0.1:5181/phase8-check.html?preview=document .
