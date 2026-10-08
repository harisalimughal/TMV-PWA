import { useCallback, useEffect, useState } from "react";
import { supportsGeolocation } from "../../../lib/pwa/platform";
import type { LocationPermissionState } from "../../../lib/pwa/types";

interface LocationPermissionApi {
  permission: LocationPermissionState;
  supported: boolean;
  checking: boolean;
  request: () => Promise<LocationPermissionState>;
  refresh: () => Promise<LocationPermissionState>;
}

function permissionFromGeolocationError(error: GeolocationPositionError): LocationPermissionState {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT) return "prompt";
  return "unknown";
}

function currentPermission(): LocationPermissionState {
  if (!supportsGeolocation()) return "unsupported";
  return "unknown";
}

async function queryPermission(): Promise<LocationPermissionState> {
  if (!supportsGeolocation()) return "unsupported";
  if (!navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

function requestCurrentPosition(): Promise<LocationPermissionState> {
  if (!supportsGeolocation()) return Promise.resolve("unsupported");
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      error => resolve(permissionFromGeolocationError(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    );
  });
}

/**
 * Location permission/status for the PWA Settings screen. A browser can only show
 * the native permission prompt while its state is "prompt"; once blocked, users must
 * change browser/site settings.
 */
export function useLocationPermission(): LocationPermissionApi {
  const [permission, setPermission] = useState<LocationPermissionState>(currentPermission);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async (): Promise<LocationPermissionState> => {
    const next = await queryPermission();
    setPermission(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let permStatus: PermissionStatus | undefined;
    const sync = () => {
      if (permStatus) setPermission(permStatus.state);
    };

    void queryPermission().then(next => {
      if (!cancelled) setPermission(next);
    });

    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then(status => {
        if (cancelled) return;
        permStatus = status;
        status.addEventListener("change", sync);
      })
      .catch(() => undefined);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      permStatus?.removeEventListener("change", sync);
    };
  }, [refresh]);

  const request = useCallback(async (): Promise<LocationPermissionState> => {
    setChecking(true);
    try {
      const before = await queryPermission();
      if (before === "denied" || before === "unsupported") {
        setPermission(before);
        return before;
      }
      const result = await requestCurrentPosition();
      const after = result === "granted" || result === "denied" ? result : await queryPermission();
      setPermission(after);
      return after;
    } finally {
      setChecking(false);
    }
  }, []);

  return {
    permission,
    supported: supportsGeolocation(),
    checking,
    request,
    refresh
  };
}
