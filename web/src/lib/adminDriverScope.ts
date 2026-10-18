import { useSyncExternalStore } from "react";

export const INCLUDE_MA_KEY = "tmv:admin-include-ma";
const CHANGE = "tmv:admin-driver-scope";
let fallback = false;
export function readIncludeMA(): boolean {
  try { return localStorage.getItem(INCLUDE_MA_KEY) === "1"; } catch { return fallback; }
}
export function setIncludeMA(include: boolean) {
  fallback = include;
  try { localStorage.setItem(INCLUDE_MA_KEY, include ? "1" : "0"); } catch { /* use memory when storage is unavailable */ }
  window.dispatchEvent(new Event(CHANGE));
}
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE, listener);
  const storage = (event: StorageEvent) => { if (event.key === INCLUDE_MA_KEY || event.key === null) listener(); };
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(CHANGE, listener); window.removeEventListener("storage", storage); };
}
export const useIncludeMA = () => useSyncExternalStore(subscribe, readIncludeMA, () => false);
// The saved preference belongs to Overview. All ordinary reads keep every driver.
// Overview opts out through explicit query parameters and separate query keys.
export function adminReadHeaders(headers?: HeadersInit): Record<string, string> {
  return { ...Object.fromEntries(new Headers(headers).entries()), "X-TMV-Include-MA": "true" };
}
/** Reports/exports outside Overview always retain all drivers. */
export function scopedAdminUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("includeMA", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}
