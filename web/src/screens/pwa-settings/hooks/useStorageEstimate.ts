import { useCallback, useEffect, useState } from "react";
import { readStorageEstimate } from "../../../lib/pwa/caches";
import type { StorageEstimateState } from "../../../lib/pwa/types";

interface StorageEstimateApi extends StorageEstimateState {
  /** Fraction of quota in use, 0–1 (0 when unknown). */
  ratio: number;
  refresh: () => Promise<void>;
}

const INITIAL: StorageEstimateState = {
  supported: true,
  loading: true,
  usage: 0,
  quota: 0,
};

/** `navigator.storage.estimate()` as reactive state, with a manual refresh for after
 *  the cache is cleared. */
export function useStorageEstimate(): StorageEstimateApi {
  const [state, setState] = useState<StorageEstimateState>(INITIAL);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    const next = await readStorageEstimate();
    setState({ ...next, loading: false });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStorageEstimate().then(next => {
      if (!cancelled) setState({ ...next, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ratio =
    state.quota > 0 ? Math.min(1, Math.max(0, state.usage / state.quota)) : 0;

  return { ...state, ratio, refresh };
}
