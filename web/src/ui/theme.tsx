import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Theme preference + resolution.
 *
 * `preference` is what the user chose: "light", "dark", or "system" (follow the OS).
 * `resolved` is the concrete theme in effect. The provider writes `data-theme` and
 * `color-scheme` onto <html> and keeps <meta name="theme-color"> in sync; an inline
 * script in index.html does the same before first paint so there is no flash.
 *
 * First visit defaults to "system" — the OS preference is honoured. The choice is
 * persisted and synced across tabs via the `storage` event.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tmv-theme";
const META_LIGHT = "#FFFFFF";
const META_DARK = "#0D0F13";
const MQ = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage can throw in private modes — fall through to the default.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MQ).matches;
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? META_DARK : META_LIGHT);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  // Track the OS setting while preference is "system".
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(MQ);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Keep multiple tabs (and the dev preview iframe) in sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setPreferenceState(readStoredPreference());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice just won't persist across reloads.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
