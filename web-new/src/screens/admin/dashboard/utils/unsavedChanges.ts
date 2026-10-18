/**
 * Shared "unsaved changes" registry so in-app navigation (sidebar, command palette)
 * can warn before discarding edits, and the browser warns on reload / tab close.
 *
 * Editors call `useUnsavedChanges(id, dirty)`; AdminApp calls `guardNavigation()`
 * before switching section and renders the confirmation when it returns false.
 */
import { useEffect, useSyncExternalStore } from "react";

const dirtySources = new Set<string>();
const listeners = new Set<() => void>();
let pending: (() => void) | null = null;

function emit() { listeners.forEach(listener => listener()); }

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirtySources.size) return;
  event.preventDefault();
  event.returnValue = "";
}

export function setUnsaved(id: string, dirty: boolean) {
  const had = dirtySources.has(id);
  if (dirty) dirtySources.add(id); else dirtySources.delete(id);
  if (had !== dirty) {
    if (dirtySources.size === 1 && dirty) window.addEventListener("beforeunload", onBeforeUnload);
    if (dirtySources.size === 0) window.removeEventListener("beforeunload", onBeforeUnload);
    emit();
  }
}

export function hasUnsavedChanges() { return dirtySources.size > 0; }

/** Runs `navigate` now when nothing is dirty; otherwise parks it until the user
 *  confirms via {@link confirmPendingNavigation} or cancels. */
export function guardNavigation(navigate: () => void): boolean {
  if (!dirtySources.size) { navigate(); return true; }
  pending = navigate;
  emit();
  return false;
}

export function confirmPendingNavigation() {
  const run = pending;
  pending = null;
  dirtySources.clear();
  window.removeEventListener("beforeunload", onBeforeUnload);
  emit();
  run?.();
}

export function cancelPendingNavigation() { pending = null; emit(); }

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function usePendingNavigation(): boolean {
  return useSyncExternalStore(subscribe, () => pending !== null, () => false);
}

export function useUnsavedChanges(id: string, dirty: boolean) {
  useEffect(() => { setUnsaved(id, dirty); }, [id, dirty]);
  useEffect(() => () => setUnsaved(id, false), [id]);
}
