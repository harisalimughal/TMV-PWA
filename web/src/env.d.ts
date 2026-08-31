/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Dev-only flag. Set to "false" to disable the in-repo mock API and talk to a
   *  real backend on the Vite proxy target instead. Defaults to on in `npm run dev`. */
  readonly VITE_MOCK_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version, injected at build time by `define` in vite.config.ts from
 *  package.json. See src/lib/pwa/version.ts — the single place these are read. */
declare const __APP_VERSION__: string;
/** Git short SHA (or build date, or "dev"), injected at build time. */
declare const __BUILD_ID__: string;

/**
 * `beforeinstallprompt` — Chromium-only, absent from lib.dom. Captured pre-React by
 * an inline script in index.html and stashed on `window.__tmvInstallPrompt`.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface Window {
  /** Set by the inline capture script; cleared once used or after `appinstalled`. */
  __tmvInstallPrompt?: BeforeInstallPromptEvent | null;
  /** Set to true by the inline script when `appinstalled` fires. */
  __tmvInstalled?: boolean;
}

interface Navigator {
  /** Non-standard iOS Safari flag for "launched from Home Screen". */
  readonly standalone?: boolean;
}
