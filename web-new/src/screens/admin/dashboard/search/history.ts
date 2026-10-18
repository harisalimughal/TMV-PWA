/**
 * Recently opened results and recent searches, kept only in this browser.
 *
 * - Recent records (localStorage) store the type, id, a short label and the
 *   destination. Job labels are the reference only and customers are never stored,
 *   so no customer name or contact detail is persisted.
 * - Recent searches (sessionStorage) last until the tab closes, are limited to five,
 *   and only record a query when a result was opened from it.
 * Both are cleared on sign-out and when the session expires, so the next person to
 * sign in on a shared computer never sees them. Nothing is sent to the server.
 */
import type { SearchResult, Target } from "./providers";

const RECENT_KEY = "tmv:admin-search-recent";
const QUERIES_KEY = "tmv:admin-search-queries";
const MAX_RECENT = 6;
const MAX_QUERIES = 5;

export interface RecentItem { type: "driver" | "job" | "vehicle" | "liability" | "page" | "action"; id: string; label: string; target: Target }

function read<T>(storage: () => Storage, key: string): T[] {
  try { const value = JSON.parse(storage().getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function write(storage: () => Storage, key: string, value: unknown[]) {
  try { storage().setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: history is optional */ }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

export function recentItems(): RecentItem[] {
  return read<RecentItem>(local, RECENT_KEY).filter(item => item && typeof item.id === "string" && typeof item.label === "string" && item.target);
}

export function rememberResult(result: SearchResult) {
  if (result.type === "customer" || result.type === "alert") return;
  const label = result.type === "job" ? result.id : result.label;
  const item: RecentItem = { type: result.type, id: result.id, label, target: result.target };
  write(local, RECENT_KEY, [item, ...recentItems().filter(entry => !(entry.type === item.type && entry.id === item.id))].slice(0, MAX_RECENT));
}

export function recentQueries(): string[] {
  return read<string>(session, QUERIES_KEY).filter(entry => typeof entry === "string");
}

export function rememberQuery(query: string) {
  const value = query.trim().slice(0, 80);
  if (value.length < 2) return;
  write(session, QUERIES_KEY, [value, ...recentQueries().filter(entry => entry.toLowerCase() !== value.toLowerCase())].slice(0, MAX_QUERIES));
}

export function clearSearchHistory() {
  try { local().removeItem(RECENT_KEY); session().removeItem(QUERIES_KEY); } catch { /* nothing stored */ }
}
