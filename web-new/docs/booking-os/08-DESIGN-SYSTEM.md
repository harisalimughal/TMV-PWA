# Booking OS design system

Scope: everything under `src/screens/admin/dashboard/bookings/`. Tokens live in `bookingTheme.css` under `.bos`
and do not reach the rest of the admin or the driver app. `bookingTheme.test.ts` checks contrast and the palette.

## Themes

- **Light:** warm ivory canvas `#FAF7F0`, white surfaces, warm greys. Body and secondary text hold AA on every surface.
- **Dark:** true black canvas `#080808`, surfaces `#121212` and `#191919`, neutral greys only (R = G = B, no navy).
- Follows the admin theme switch (`data-admin-theme`). Dialogs render in a portal inside their own `.bos` wrapper
  so the tokens still apply.

## Accents (fills and marks) and their text-safe shades

Azure `#258BFF` primary action and links, cyan `#20C5E8` information, violet `#7959F5` scheduling, emerald `#16B887`
confirmed, amber `#F4AC45` needs attention, coral `#F16870` risk. Text uses the darker `--bos-*-fg` shade in light and
a lighter shade in dark, so the bright fills are never used for small text. Every status also carries a text label.

## Type

Geist is not installed and this change adds no dependency. The stack is Inter Variable, then the admin sans
(Hanken Grotesk). Numbers use tabular figures.

## Components (`ui.tsx`)

`BosRoot`, `Card`, `KpiCard`, `StatusPill`, `Button`, `SecondaryNav`, `BosDialog`, `BosTabs`, `RadialGauge`, `Donut`,
`Skeleton`/`LoadingBlock`, `EmptyState`, `ErrorState`, `SampleBanner`, `Missing`. Each data view has loading, empty
and error forms. Charts are SVG with a text equivalent in `aria-label`. Motion respects `prefers-reduced-motion`.

## Rules

Missing is `Missing`, never `0`. Money only through `formatMoney`. Times are London. Dialogs use `BosDialog`
(`useDialogFocus`). No fixed overlays inline.
