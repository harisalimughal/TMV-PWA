# TMV dashboard UI, full source snapshot

Source: repository talhaazhar-ta/projectnewTMV, branch main, commit e444cc2 (2026-10-17).
This is the current merged state. It includes every change up to and including the Booking OS
module, Google Calendar settings, Activity interactivity and the second UI inspection fixes.

## What is inside
- src/screens/admin/        the whole Aurora dashboard (pages, components, hooks, utils, tests, theme CSS)
- src/screens/admin/dashboard/bookings/   Booking OS (Command Centre, Enquiries, Wizard, All Bookings, Calendar, Dispatch)
- src/ui/, src/styles/, src/index.css      shared UI primitives and global styles
- src/lib/                  shared logic (activity, booking, admin transport, host detection)
- src/mocks/                demo and dev mock API (fictional data)
- src/App.tsx, src/main.tsx entry points
- configs: package.json, lockfile, vite, vitest, tailwind, postcss, tsconfig, scripts/ (PWA precache guard)
- docs/                     all markdown docs, including docs/booking-os/ (00 to 10) and the audits
- CLAUDE.md                 project rules (precache rule, dialogs, data honesty, themes)

Screenshots and the driver app screens are not included.

## Run it
    npm ci
    npm run dev       then open http://localhost:3001/admin (use localhost, not 127.0.0.1)
    npm run verify    typecheck, tests, build, precache check

## Dashboard pages (src/screens/admin/dashboard/pages)
- ActivityPage.tsx
- AlertsCenterPage.tsx
- DriverReportPage.tsx
- DriversPage.tsx
- EvidencePage.tsx
- JobsPage.tsx
- LiveFleetPage.tsx
- MaintenancePage.tsx
- OverviewPage.tsx
- SettingsPage.tsx
- VehiclesPage.tsx

## Booking OS (src/screens/admin/dashboard/bookings)
- AllBookings.tsx
- BookingDetails.tsx
- BookingWizard.tsx
- BookingsPage.tsx
- Calendar.tsx
- CommandCentre.tsx
- Dispatch.tsx
- EnquiryInbox.tsx
- MovePanel.tsx
- bookingTheme.css
- hooks.ts
- source.tsx
- ui.tsx

## Components (src/screens/admin/dashboard/components)
- AddDriverModal.test.tsx
- AddDriverModal.tsx
- AddJobModal.test.tsx
- AddJobModal.tsx
- AlertsBell.test.tsx
- AlertsBell.tsx
- AttentionList.tsx
- BulkDeleteModal.tsx
- BulkDismissModal.tsx
- CommandPalette.test.tsx
- CommandPalette.tsx
- DateRangePicker.test.tsx
- DateRangePicker.tsx
- DriverCards.test.ts
- DriverCards.tsx
- DriverPerformanceCharts.test.ts
- DriverPerformanceCharts.tsx
- DriverPerformanceSummary.test.tsx
- DriverPerformanceSummary.tsx
- DriverReportView.test.tsx
- DriverReportView.tsx
- JobDetailModal.test.tsx
- JobDetailModal.tsx
- JobScenarioSection.tsx
- JobTimeBreakdown.test.tsx
- JobTimeBreakdown.tsx
- LiabilityConfigModal.test.tsx
- LiabilityConfigModal.tsx
- LiveFleetMap.test.tsx
- LiveFleetMap.tsx
- ManualRoadChargeCard.tsx
- PaperDossierReport.layout.test.tsx
- PaperDossierReport.test.tsx
- PaperDossierReport.tsx
- PaperScenarioReport.test.tsx
- PaperScenarioReport.tsx
- PdfPreviewModal.test.tsx
- PdfPreviewModal.tsx
- PhotoModal.tsx
- PrintPortal.tsx
- ReportDocumentHeader.test.tsx
- ReportDocumentHeader.tsx
- ReportPreviewCanvas.test.tsx
- ReportPreviewCanvas.tsx
- SendBroadcastPushModal.test.tsx
- SendBroadcastPushModal.tsx
- ShortcutsModal.tsx
- StatusBadge.tsx
- activity
- ds
- jobdetail
- jobs
- overview
- performance
- report
- reportDocument.css
- settings

## File counts
- src/screens/admin/dashboard/pages: 19 files
- src/screens/admin/dashboard/components: 111 files
- src/screens/admin/dashboard/bookings: 19 files
- src/screens/admin/dashboard/hooks: 14 files
- src/screens/admin/dashboard/utils: 36 files
- total files in this zip: 453
