# Report preview polish

Implemented locally on 2026-10-10. No production data access, writes, push or deployment.

## Scope

- Finished-job dossier, legacy job report, check-in, check-out, parking and liability report previews use a shared document header and restrained paper styling.
- Main report title appears once. Repeated THE MAN VAN branding is removed; the office phone remains on the first page, and continuation pages retain their reference.
- Metadata and financial rows wrap without truncating long addresses or names. Evidence images remain contained rather than cropped.
- Preview zoom reserves the scaled document's scrollable dimensions. Zoom/fullscreen controls occupy a footer outside the scrolling document.
- Scenario preview hides editing/activity sidebars; Back to Form restores them.
- Source fields, financial calculations, timestamps, evidence ordering, captions, signatures and notice wording are unchanged.

## Verification

- Full frontend regression: 249 tests across 55 files passed. Frontend build, including TypeScript checks, passed; existing large-chunk warnings remain.
- Component tests cover single headings, removed branding, retained financial/customer/media data, all four scenario types, source immutability, zoom dimensions and preview/form switching.
- Synthetic browser checks covered finished-job desktop/mobile previews, zoom interaction and mobile parking preview at 390 x 844. Scoped visible previews had one main heading and all fixture images loaded.
- Native browser print dialogs, downloaded PDF pagination and physical printing were not exercised. Existing print pathways remain in place; extreme-length content needs native print review before release.
- The isolated synthetic preview is available at http://127.0.0.1:5181/phase8-check.html?preview=document while the local test server runs.
