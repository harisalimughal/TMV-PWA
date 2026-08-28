# App icons needed here

The manifest (`vite.config.ts`) and `index.html` already reference these files; they
just don't exist yet, so the PWA install prompt/icon will look broken until they're added.

Needed, all PNG:

- `icon-192.png` — 192x192, used as the general app icon (Android home screen, etc.)
- `icon-512.png` — 512x512, used for splash screens and higher-DPI displays
- `icon-maskable-512.png` — 512x512, **maskable** format: the actual logo must fit inside
  the safe zone (the center ~80% of the canvas) since Android crops maskable icons to
  various shapes (circle, squircle, rounded square) depending on the device's icon theme.
  A regular icon used as maskable will get its edges clipped off.

These need real brand design, not just a resized version of an existing logo — get them
from the client, or design them properly with the maskable safe-zone constraint in mind.
A quick way to generate all three correctly from one source image once you have it:
https://maskable.app (drag in the source art, exports all three sizes correctly).
