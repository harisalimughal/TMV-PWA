/**
 * Service-worker registration singleton.
 *
 * Wraps vite-plugin-pwa's `virtual:pwa-register` (the project's existing PWA
 * infrastructure — there is no second, competing service worker). The plugin is on
 * `registerType: "prompt"`, so a new worker installs and then *waits*; this module
 * exposes that lifecycle as observable state plus two actions:
 *
 *   - `checkForUpdates()` → `registration.update()`, for the manual button
 *   - `applyUpdate()`     → tells the waiting worker to `skipWaiting` and reloads once
 *
 * `updateSW(true)` (from the plugin) performs the SKIP_WAITING message + a single
 * reload on `controllerchange`; it is internally guarded against reload loops.
 */

import { registerSW } from "virtual:pwa-register";
import type { ServiceWorkerUpdateState, UpdateCheckResult } from "./types";
import { supportsServiceWorker } from "./platform";

const LAST_CHECK_KEY = "tmv-pwa:last-update-check";
/** How often to quietly re-check for a new worker while the app is open. */
const PERIODIC_CHECK_MS = 60 * 60 * 1000;

function readLastCheck(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastCheck(ts: number): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(ts));
  } catch {
    /* non-critical: the "last checked" line just won't persist */
  }
}

const state: ServiceWorkerUpdateState = {
  supported: supportsServiceWorker(),
  registered: false,
  needRefresh: false,
  offlineReady: false,
  controlled:
    supportsServiceWorker() && !!navigator.serviceWorker.controller,
  checking: false,
  updating: false,
  lastCheck: readLastCheck(),
};

type Listener = (s: ServiceWorkerUpdateState) => void;
const listeners = new Set<Listener>();

function snapshot(): ServiceWorkerUpdateState {
  return { ...state };
}

function emit(): void {
  const s = snapshot();
  for (const l of listeners) l(s);
}

function patch(next: Partial<ServiceWorkerUpdateState>): void {
  Object.assign(state, next);
  emit();
}

let started = false;
let swRegistration: ServiceWorkerRegistration | undefined;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let periodicTimer: ReturnType<typeof setInterval> | undefined;
let updateNotificationShown = false;

/** Idempotent. Safe to call from both `main.tsx` and the hook. */
export function initServiceWorker(): void {
  if (started || !state.supported) return;
  started = true;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      patch({ needRefresh: true, registered: true });
      void notifyUpdateAvailable();
    },
    onOfflineReady() {
      patch({ offlineReady: true, registered: true });
    },
    onRegisteredSW(_swUrl, registration) {
      swRegistration = registration;
      patch({
        registered: !!registration,
        offlineReady: state.offlineReady || !!navigator.serviceWorker.controller,
      });
      if (registration) startPeriodicChecks(registration);
    },
    onRegisterError(error) {
      report("Service worker registration failed", error);
      patch({ registered: false });
    },
  });

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      patch({ controlled: !!navigator.serviceWorker.controller });
    });
  }
}

async function notifyUpdateAvailable(): Promise<void> {
  if (updateNotificationShown || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  updateNotificationShown = true;

  try {
    const registration =
      swRegistration ?? (await navigator.serviceWorker.getRegistration());
    await registration?.showNotification("TMV BOT update ready", {
      body: "Tap to update the app now.",
      icon: "/icons/icon-192.png",
      tag: "tmv-app-update",
      data: {
        action: "TMV_APPLY_UPDATE",
        url: "/?update=app"
      }
    });
  } catch (err) {
    updateNotificationShown = false;
    report("Showing update notification failed", err);
  }
}

function startPeriodicChecks(registration: ServiceWorkerRegistration): void {
  if (periodicTimer) return;
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    registration.update().catch(err => report("Periodic SW update check failed", err));
  };
  periodicTimer = setInterval(tick, PERIODIC_CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  window.addEventListener("online", tick);
}

export function subscribe(listener: Listener): () => void {
  initServiceWorker();
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): ServiceWorkerUpdateState {
  return snapshot();
}

/**
 * Manual update check for the "Check for Updates" button. Resolves with a result the
 * UI can turn into a message; never throws.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  initServiceWorker();
  if (!state.supported) return "unsupported";

  patch({ checking: true });
  try {
    const registration =
      swRegistration ?? (await navigator.serviceWorker.getRegistration());
    if (!registration) return "error";

    await registration.update();

    // `update()` resolving doesn't mean a new worker exists — check what's there.
    const pending =
      state.needRefresh ||
      !!registration.waiting ||
      !!registration.installing;
    return pending ? "update-available" : "up-to-date";
  } catch (err) {
    report("Manual update check failed", err);
    return "error";
  } finally {
    const now = Date.now();
    writeLastCheck(now);
    patch({ checking: false, lastCheck: now });
  }
}

/**
 * Activate the waiting worker and reload once it takes control. The plugin's
 * `updateSW(true)` handles the SKIP_WAITING post + single reload on `controllerchange`.
 */
export async function applyUpdate(): Promise<void> {
  initServiceWorker();
  if (!updateSW || !state.needRefresh) return;
  patch({ updating: true });
  try {
    await updateSW(true);
  } catch (err) {
    report("Applying service worker update failed", err);
    patch({ updating: false });
  }
}

/**
 * The one place PWA errors are surfaced. The project has no logger module, so this is
 * a single DEV-gated console call behind a helper — trivial to redirect to a real
 * logging mechanism later without touching call sites.
 */
function report(message: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[pwa] ${message}`, error);
  }
}
