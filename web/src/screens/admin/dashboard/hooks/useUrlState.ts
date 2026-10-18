import { useCallback, useEffect, useRef, useState } from "react";
import { updateUrlParams } from "../navigation";

/**
 * Page state mirrored into the query string. Values equal to their default are left
 * out of the URL, so a page opened from the sidebar has a clean URL and a page opened
 * from a shared link restores exactly what was shared. Back/Forward re-read the URL.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>, options?: { push?: boolean }) => void] {
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const read = useCallback((): T => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaultsRef.current };
    for (const key of Object.keys(next) as Array<keyof T>) {
      const value = params.get(key as string);
      if (value !== null) next[key] = value as T[keyof T];
    }
    return next;
  }, []);
  const [state, setState] = useState<T>(read);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);
  const update = useCallback((patch: Partial<T>, options?: { push?: boolean }) => {
    // Side effects stay outside the state updater (StrictMode runs updaters twice).
    const next = { ...stateRef.current, ...patch } as T;
    stateRef.current = next;
    const params: Record<string, string | null> = {};
    for (const key of Object.keys(patch)) params[key] = next[key] === defaultsRef.current[key] ? null : next[key];
    setState(next);
    updateUrlParams(params, options?.push);
  }, []);
  return [state, update];
}
