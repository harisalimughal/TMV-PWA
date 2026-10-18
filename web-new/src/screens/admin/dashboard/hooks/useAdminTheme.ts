/**
 * Admin theme preference: Aurora Light, Midnight Aurora, or follow the system.
 *
 * Kept separate from the driver app's `tmv-theme` so changing one never restyles the
 * other. With no stored choice the admin follows the operating system; an explicit
 * choice is persisted. The resolved theme is written to `data-admin-theme` on <html>
 * (see adminTheme.css), which is also what dialogs rendered in portals inherit.
 */
import { useEffect, useSyncExternalStore } from "react";

export type AdminThemePreference = "light" | "dark" | "system";
export type AdminThemeResolved = "light" | "dark";

export const ADMIN_THEME_KEY = "tmv:admin-theme";
const MQ = "(prefers-color-scheme: dark)";

function readPreference(): AdminThemePreference {
  try {
    const stored = localStorage.getItem(ADMIN_THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch { /* storage unavailable: follow the system */ }
  return "system";
}

const systemDark = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MQ).matches;

export function resolveAdminTheme(preference: AdminThemePreference, prefersDark: boolean): AdminThemeResolved {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

let preference: AdminThemePreference = readPreference();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MQ) : null;
  mq?.addEventListener?.("change", listener);
  const onStorage = (event: StorageEvent) => { if (event.key === ADMIN_THEME_KEY) { preference = readPreference(); emit(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); mq?.removeEventListener?.("change", listener); window.removeEventListener("storage", onStorage); };
}

export function setAdminThemePreference(next: AdminThemePreference) {
  preference = next;
  try { localStorage.setItem(ADMIN_THEME_KEY, next); } catch { /* the choice lasts this session */ }
  emit();
}

/** Browser toolbar colour per theme: the canvas colour, so the phone's status bar matches. */
export const ADMIN_META_COLOR: Record<AdminThemeResolved, string> = { light: "#F8F9FB", dark: "#000000" };

/** Mounted users of useAdminTheme; see the cleanup below. */
let appliers = 0;

/** Current preference + the concrete theme in effect. Applies it to <html>. */
export function useAdminTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference, () => "system" as AdminThemePreference);
  const dark = useSyncExternalStore(subscribe, systemDark, () => false);
  const resolved = resolveAdminTheme(pref, dark);
  useEffect(() => {
    const root = document.documentElement;
    appliers += 1;
    root.dataset.adminTheme = resolved;
    // Native controls (date pickers, selects, scrollbars) follow the inline color-scheme,
    // which beats the stylesheet; without this they kept the driver app's scheme.
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ADMIN_META_COLOR[resolved]);
    // Several components use this hook (AdminApp, Layout). Only the last one to unmount
    // clears the attribute: when Layout unmounted on sign-out it used to delete it while
    // AdminApp stayed mounted, so the sign-in screen fell back to light under Midnight.
    return () => { appliers -= 1; if (appliers === 0) { delete root.dataset.adminTheme; root.style.colorScheme = ""; } };
  }, [resolved]);
  return { preference: pref, resolved, setPreference: setAdminThemePreference };
}
