/**
 * Pure derivation of the install situation from a snapshot of the environment, plus
 * the presentation mapping for the status badge. Kept free of DOM access so it can be
 * unit-tested exhaustively; the hook assembles the `InstallEnv` from live detection.
 */

import type { BadgeTone } from "../../ui";
import type { InstallStatus, Platform } from "./types";

export interface InstallEnv {
  /** Running as an installed app already. */
  installed: boolean;
  /** A `beforeinstallprompt` event has been captured and can be fired. */
  canPrompt: boolean;
  platform: Platform;
  /** Genuine Safari on iOS/iPadOS. */
  iosSafari: boolean;
  /** Chromium-family browser (can install from its own menu even without the event). */
  chromium: boolean;
}

export function resolveInstallStatus(env: InstallEnv): InstallStatus {
  if (env.installed) return "installed";
  if (env.canPrompt) return "installable";
  if (env.platform === "ios") return env.iosSafari ? "ios-safari" : "ios-other-browser";
  if (env.chromium) return "needs-browser-menu";
  return "unsupported";
}

export interface InstallStatusPresentation {
  /** Short label for the Installation Status badge. */
  label: string;
  tone: BadgeTone;
  /** Longer sentence for supporting copy. */
  detail: string;
}

export function describeInstallStatus(status: InstallStatus): InstallStatusPresentation {
  switch (status) {
    case "installed":
      return {
        label: "Installed",
        tone: "success",
        detail: "TMV BOT is installed on this device.",
      };
    case "installable":
      return {
        label: "Available to install",
        tone: "brand",
        detail: "This device can install TMV BOT now.",
      };
    case "ios-safari":
      return {
        label: "Available to install",
        tone: "brand",
        detail: "Add TMV BOT to your Home Screen from the Safari share menu.",
      };
    case "ios-other-browser":
      return {
        label: "Open in Safari to install",
        tone: "warning",
        detail: "Installing on iPhone or iPad has to be done from Safari.",
      };
    case "needs-browser-menu":
      return {
        label: "Browser install prompt unavailable",
        tone: "neutral",
        detail: "Your browser can still install TMV BOT from its own menu.",
      };
    case "unsupported":
    default:
      return {
        label: "Installation not supported",
        tone: "neutral",
        detail: "This browser can't install web apps. Try Chrome, Edge, or Safari on a phone.",
      };
  }
}
