# App icons

`icon-192.png`, `icon-512.png`, `icon-maskable-512.png` are generated from the existing
marketing logo (`dashboard/web/public/tmv-logo.png` in TMV-Chat-bot -- the "Helping you
move forward" badge, not the letterboxed `tmv-new-logo.png`), centered on a white canvas
with padding.

This is a stand-in, not a professionally designed app icon -- the source has small text
("Helping you move forward", the URL) that's barely legible at 192px, and wasn't designed
with the maskable safe-zone in mind. It fixed the real functional problem (Chrome refused
to offer a proper "Install" and fell back to "Create shortcut" -- opens in a browser tab,
generic letter-tile icon -- when the manifest's icons 404'd), but a real icon-only mark
from the client (no wordmark, designed square) would look meaningfully better. Once you
have one, regenerate all three sizes correctly in one pass at https://maskable.app.
