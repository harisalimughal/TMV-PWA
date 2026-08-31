/**
 * Centralised platform + capability detection.
 *
 * Everything the rest of the PWA code needs to know about the environment is derived
 * here, once. Prefer the capability helpers (`supports*`) — user-agent sniffing is
 * confined to the few places iOS genuinely behaves differently (it exposes no
 * `beforeinstallprompt`, so "is this iOS Safari" has to be answered by UA).
 */

import type { DisplayMode, Platform } from "./types";

/** `navigator.standalone` is a non-standard Safari-only flag missing from lib.dom. */
interface SafariNavigator extends Navigator {
  standalone?: boolean;
}

function ua(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const s = ua();
  const isIDevice = /iPad|iPhone|iPod/.test(s);
  // iPadOS 13+ masquerades as desktop Safari; the touch-point count gives it away.
  const isIpadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIDevice || isIpadOs;
}

export function isAndroid(): boolean {
  return /Android/.test(ua());
}

export function getPlatform(): Platform {
  if (isIos()) return "ios";
  if (isAndroid()) return "android";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/.test(ua())) return "desktop";
  return "other";
}

/**
 * True when running as an installed app (any of the standalone-ish display modes, or
 * the iOS-specific flag). Checked reactively by the install hook via a matchMedia
 * listener as well.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.bind(window);
  const standalone = mm?.("(display-mode: standalone)")?.matches ?? false;
  const minimalUi = mm?.("(display-mode: minimal-ui)")?.matches ?? false;
  const fullscreen = mm?.("(display-mode: fullscreen)")?.matches ?? false;
  const iosStandalone = (window.navigator as SafariNavigator).standalone === true;
  return standalone || minimalUi || fullscreen || iosStandalone;
}

export function getDisplayMode(): DisplayMode {
  return isStandalone() ? "standalone" : "browser";
}

/**
 * True only for genuine Safari on iOS/iPadOS — the one browser there that can install
 * to the Home Screen. Chrome/Firefox/Edge on iOS (CriOS/FxiOS/EdgiOS/OPiOS) and
 * in-app web views cannot, and must be told to open the page in Safari first.
 */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const s = ua();
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(s);
  const looksLikeSafari = /Safari/.test(s) && /Version\//.test(s);
  return looksLikeSafari && !otherBrowser && !isInAppBrowser();
}

/** Heuristic for embedded web views (social apps, "open in app" browsers). */
export function isInAppBrowser(): boolean {
  const s = ua();
  if (!s) return false;
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|Snapchat|Pinterest|LinkedInApp|GSA\//.test(s)) {
    return true;
  }
  // Android web views advertise "; wv". iOS web views usually just omit "Safari".
  if (isAndroid() && /; wv\)/.test(s)) return true;
  if (isIos() && /AppleWebKit/.test(s) && !/Safari/.test(s) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(s)) {
    return true;
  }
  return false;
}

/** Chromium-family browsers expose this even before the event fires. */
export function browserSupportsInstallPrompt(): boolean {
  return typeof window !== "undefined" && "onbeforeinstallprompt" in window;
}

export function supportsServiceWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function supportsPush(): boolean {
  return (
    typeof window !== "undefined" && "PushManager" in window && supportsServiceWorker()
  );
}

export function supportsStorageEstimate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.estimate === "function"
  );
}

export function supportsCacheStorage(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}
