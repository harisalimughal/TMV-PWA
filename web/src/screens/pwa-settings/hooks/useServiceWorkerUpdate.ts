import { useCallback, useEffect, useState } from "react";
import {
  applyUpdate,
  checkForUpdates,
  getState,
  subscribe,
} from "../../../lib/pwa/registration";
import type {
  ServiceWorkerUpdateState,
  UpdateCheckResult,
} from "../../../lib/pwa/types";

interface ServiceWorkerUpdate extends ServiceWorkerUpdateState {
  checkForUpdates: () => Promise<UpdateCheckResult>;
  applyUpdate: () => Promise<void>;
}

/**
 * React view over the service-worker registration singleton. Multiple components can
 * mount this (the Settings card and the app-wide banner) — they all read the same
 * state and there is still only one registration.
 */
export function useServiceWorkerUpdate(): ServiceWorkerUpdate {
  const [state, setState] = useState<ServiceWorkerUpdateState>(getState);

  useEffect(() => subscribe(setState), []);

  return {
    ...state,
    checkForUpdates: useCallback(() => checkForUpdates(), []),
    applyUpdate: useCallback(() => applyUpdate(), []),
  };
}
