/**
 * Test stub for `virtual:pwa-register`.
 *
 * vitest.config.ts aliases the virtual module to this file so unit tests never need
 * the real vite-plugin-pwa runtime (which only exists during a Vite build/dev). The
 * shape matches vite-plugin-pwa's `RegisterSWOptions` / return signature closely
 * enough for the code under test.
 */

export interface RegisterSWOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

export function registerSW(_options: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  return async () => {
    /* no-op in tests */
  };
}
