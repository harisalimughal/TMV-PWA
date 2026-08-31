/**
 * Storage estimate + *safe* cache clearing.
 *
 * "Clear cached app data" must only ever remove regenerable PWA caches:
 *   - the Workbox precache (`workbox-precache-*`) — rebuilt by the service worker
 *   - Workbox runtime caches (`workbox-runtime-*`)
 *
 * It must never touch:
 *   - IndexedDB (`tmv-outbox` holds unsent job submissions — see lib/outbox.ts)
 *   - localStorage (`tmv-theme`, `tmv-driver-avatar`, update-check timestamp)
 *   - cookies / the auth session
 *   - any Cache Storage entry whose name we don't recognise
 */

import {
  supportsCacheStorage,
  supportsServiceWorker,
  supportsStorageEstimate,
} from "./platform";
import type { OfflineReadiness, StorageEstimateState } from "./types";

/** Cache-name prefixes that are safe to delete and will be regenerated. */
const SAFE_CACHE_PREFIXES = [
  "workbox-precache",
  "workbox-runtime",
  "vite-pwa",
] as const;

export function isSafeToClear(cacheName: string): boolean {
  return SAFE_CACHE_PREFIXES.some(prefix => cacheName.startsWith(prefix));
}

export async function listClearableCaches(): Promise<string[]> {
  if (!supportsCacheStorage()) return [];
  try {
    const keys = await caches.keys();
    return keys.filter(isSafeToClear);
  } catch {
    return [];
  }
}

export interface ClearCachesResult {
  cleared: string[];
  failed: string[];
  /** True when the API isn't available at all. */
  unsupported: boolean;
}

export async function clearAppCaches(): Promise<ClearCachesResult> {
  if (!supportsCacheStorage()) {
    return { cleared: [], failed: [], unsupported: true };
  }

  const cleared: string[] = [];
  const failed: string[] = [];

  let keys: string[] = [];
  try {
    keys = await caches.keys();
  } catch {
    return { cleared, failed, unsupported: true };
  }

  for (const name of keys) {
    if (!isSafeToClear(name)) continue;
    try {
      const ok = await caches.delete(name);
      if (ok) cleared.push(name);
      else failed.push(name);
    } catch {
      failed.push(name);
    }
  }

  return { cleared, failed, unsupported: false };
}

/** Whether offline resources are genuinely present and the page is SW-controlled. */
export async function getOfflineReadiness(): Promise<OfflineReadiness> {
  if (!supportsCacheStorage() || !supportsServiceWorker()) return "unavailable";
  try {
    const keys = await caches.keys();
    const hasPrecache = keys.some(name => name.startsWith("workbox-precache"));
    const controlled = !!navigator.serviceWorker.controller;
    if (hasPrecache && controlled) return "ready";
    if (hasPrecache || controlled) return "unknown";
    return "unavailable";
  } catch {
    return "unknown";
  }
}

export async function readStorageEstimate(): Promise<
  Pick<StorageEstimateState, "supported" | "usage" | "quota">
> {
  if (!supportsStorageEstimate()) return { supported: false, usage: 0, quota: 0 };
  try {
    const estimate = await navigator.storage.estimate();
    return {
      supported: true,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  } catch {
    return { supported: false, usage: 0, quota: 0 };
  }
}

/** Human-readable bytes, e.g. `42.8 MB`, `938 KB`, `1.4 GB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}
