import { useOnline } from "../../../lib/net";

/**
 * Reactive online/offline state. Thin wrapper over the app's existing `useOnline`
 * (which already listens to `window` `online` / `offline`) so the PWA Settings
 * screen doesn't add a second set of listeners for the same thing.
 */
export function useOnlineStatus(): boolean {
  return useOnline();
}
