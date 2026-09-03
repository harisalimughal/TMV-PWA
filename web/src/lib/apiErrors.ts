/**
 * Shown whenever our own infrastructure -- not the request -- is the problem: a 5xx
 * response, or the request never reaching the server at all (offline, DNS, a dead
 * upstream -- these throw before a Response even exists). Centralized so every API
 * module and every screen that displays a fetch failure says the same calm, honest
 * thing instead of a raw "Internal Server Error" or "TypeError: Failed to fetch".
 *
 * Written after the Sept 2026 incident where the VPS lost network connectivity to
 * MongoDB Atlas for a couple of hours: every page across both apps just looked quiet
 * (empty lists, a login that silently did nothing) with no indication anything was
 * actually broken, because nothing distinguished "our server failed" from "there's
 * genuinely no data" or "check your input".
 */
export const SERVER_ERROR_MESSAGE =
  "We're having a problem on our end right now. Please try again in a few minutes.";
