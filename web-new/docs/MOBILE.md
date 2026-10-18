# Admin dashboard on phones

Notes on the mobile pass (October 2026). Checked in Chromium with mobile emulation
(touch, 320 to 430 px wide) plus 768, 1024 and 1440 px, in Aurora Light and Midnight.
No real iOS or Android device was used.

## Theme

- Light, Dark and System are chosen from the **Appearance** control. From 640 px it
  sits in the header as three icons; on phones it is in the navigation drawer, with
  labels. Before this change the header control was hidden below 640 px, so phones
  had no way to choose and stayed on the system theme.
- The choice is stored in `tmv:admin-theme` (`hooks/useAdminTheme.ts`). An explicit
  Light or Dark wins over the operating system; System follows it. With no saved
  choice the dashboard follows the system, as before.
- `index.html` applies the saved admin theme before first paint on the admin
  location, so a Midnight choice no longer flashes light while the dashboard loads.
- The driver app's `ThemeProvider` no longer writes to `<html>` when the dashboard
  owns the page. It used to set an inline `color-scheme`, which beats the admin
  stylesheet: under Midnight, date pickers and selects stayed light.
- The browser toolbar colour (`meta theme-color`) follows the admin theme: `#F8F9FB`
  in Light, `#000000` in Midnight.

## Navigation

- Phone header: menu, logo (opens Overview), search, refresh, alerts, account.
- The drawer is a modal dialog on phones: focus moves in and is trapped, Escape and
  the backdrop close it, the page behind does not scroll, and focus returns to the
  menu button. When closed it is invisible, so Tab cannot reach links off screen.
  It closes on navigation. It uses the dynamic viewport height and safe-area insets.
- No bottom navigation was added: the drawer already lists the eight destinations,
  and a second nav bar would cover table pagination and report actions.

## Layout

- Segmented controls (date presets, status chips, Live fleet filters) keep one line
  on phones and scroll sideways, keeping the selected option in view, instead of
  dropping options onto a second row.
- Liability's four scenarios use a 2 x 2 grid on phones so all four stay visible.
- The date range picker takes the full toolbar width on phones; the second date
  wraps below the first instead of being clipped.
- Page padding and section spacing are slightly tighter below 768 px.

Already in place before this pass and left as is: job, liability, van and driver
lists render as cards on phones; drawers are full screen below 768 px; the Van
preview stacks its cards (driver, fuel, service, compliance with the road tax ring,
all submissions); inputs are 16 px so iOS does not zoom on focus.
