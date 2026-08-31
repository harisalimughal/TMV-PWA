/**
 * Shared PWA types. Kept separate so both the app-wide primitives in this folder and
 * the PWA Settings screen's hooks/components import from one place.
 */

/** Coarse platform bucket. Capability checks are preferred everywhere else; this is
 *  only used where iOS genuinely needs different install guidance. */
export type Platform = "ios" | "android" | "desktop" | "other";

/** How the app is being displayed right now. */
export type DisplayMode = "standalone" | "browser";

/** Derived install situation — drives both the Install card CTA and the status row. */
export type InstallStatus =
  | "installed"
  | "installable"
  | "ios-safari"
  | "ios-other-browser"
  | "needs-browser-menu"
  | "unsupported";

/** Result of firing the native install prompt. */
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/** Notification permission, plus an explicit unsupported state the DOM type lacks. */
export type NotificationPermissionState = NotificationPermission | "unsupported";

/** Service-worker update lifecycle, as surfaced to the UI. */
export interface ServiceWorkerUpdateState {
  /** `serviceWorker` exists in this browser. */
  supported: boolean;
  /** A registration has been established. */
  registered: boolean;
  /** A new service worker is waiting to activate. */
  needRefresh: boolean;
  /** First install finished and the app shell is cached for offline use. */
  offlineReady: boolean;
  /** The page is currently controlled by an active service worker. */
  controlled: boolean;
  /** A manual `Check for Updates` is in flight. */
  checking: boolean;
  /** `Update Now` has been pressed and the reload is pending. */
  updating: boolean;
  /** Epoch ms of the last completed update check, or null. */
  lastCheck: number | null;
}

/** Outcome of a manual update check, for user-facing messaging. */
export type UpdateCheckResult = "update-available" | "up-to-date" | "unsupported" | "error";

/** Storage usage snapshot from `navigator.storage.estimate()`. */
export interface StorageEstimateState {
  supported: boolean;
  loading: boolean;
  usage: number;
  quota: number;
}

/** Whether cached offline resources are actually present and usable. */
export type OfflineReadiness = "ready" | "unavailable" | "unknown";

/** Non-sensitive troubleshooting snapshot rendered in the Diagnostics section. */
export interface PwaDiagnostics {
  serviceWorker: "active" | "inactive" | "unsupported";
  displayMode: DisplayMode;
  platform: Platform;
  online: boolean;
  notificationPermission: NotificationPermissionState;
  installPromptAvailable: boolean;
  offlineReadiness: OfflineReadiness;
  appVersion: string;
  buildId: string;
}
