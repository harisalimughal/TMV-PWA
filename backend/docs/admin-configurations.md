# Configurations

Client revision, 2026-10-11. Local implementation only; no deployment authorized.

The admin sidebar has one Configurations destination (section=configurations), with Pricing Settings and Messaging Content switches aligned at the top right. Pricing Settings is the default on normal sidebar entry. configurationTab records explicit view selection and restores with browser history. Existing section=pricing and section=settings links open Pricing Settings; section=messaging opens Messaging Content.

The existing PricingSettingsPage and MessagingPage are reused unchanged. Only the selected page mounts/loads, matching the old separate-sidebar navigation behavior. Forms, setting values, validation, template editing, saves, reset actions, permissions and backend routes are unchanged. This revision does not introduce a new cross-page draft-state contract. The existing API Settings modal is separate and unchanged.

Both switches stay readable on mobile through a two-column layout with wrapping labels, returning to compact horizontal controls on larger screens. The command palette and sidebar highlight use Configurations for canonical and legacy links.

Verification: grouping/default selection, right-aligned switches, legacy links, history, sidebar entry and sidebar highlighting passed focused tests; frontend TypeScript check and production build passed. No prices, message templates or backend data were modified by this organization change.
