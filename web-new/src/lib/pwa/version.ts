/**
 * Single source of truth for the app version shown in the UI.
 *
 * `__APP_VERSION__` and `__BUILD_ID__` are injected at build time by `define` in
 * vite.config.ts — `__APP_VERSION__` from package.json, `__BUILD_ID__` from the git
 * short SHA (falling back to the build date, then `"dev"`). Nothing else in the app
 * should hard-code a version string.
 */

const RAW_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
const RAW_BUILD = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

/** e.g. `0.1.0` — no leading `v`. */
export const APP_VERSION: string = RAW_VERSION;

/** e.g. `a89c86d` or `2026-08-31`. Short, non-sensitive. */
export const BUILD_ID: string = RAW_BUILD;

/** e.g. `v0.1.0` — for display. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
