import { useEffect, useRef, useState, type RefObject } from "react";
import type { CapturedLocation, CaptureLocationError } from "../../lib/geo";

export type LocationWatchStatus = "idle" | "pending" | "ready" | CaptureLocationError;

export interface LocationWatch {
  location: CapturedLocation | null;
  locationRef: RefObject<CapturedLocation | null>;
  status: LocationWatchStatus;
  error: CaptureLocationError | null;
}

function errorFromGeolocation(error: GeolocationPositionError): CaptureLocationError {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.POSITION_UNAVAILABLE) return "unavailable";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

/**
 * Keeps the driver's latest known position while `active`, and exposes the reason
 * when the browser cannot provide one. Evidence capture still happens in-app, but
 * required evidence can now tell the driver exactly what must be fixed.
 */
export function useLocationWatch(active: boolean, resetKey = 0): LocationWatch {
  const locationRef = useRef<CapturedLocation | null>(null);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [status, setStatus] = useState<LocationWatchStatus>("idle");
  const [error, setError] = useState<CaptureLocationError | null>(null);

  useEffect(() => {
    locationRef.current = null;
    setLocation(null);
    setError(null);

    if (!active) {
      setStatus("idle");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setError("unsupported");
      return;
    }

    setStatus("pending");

    const watchId = navigator.geolocation.watchPosition(
      position => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        locationRef.current = next;
        setLocation(next);
        setStatus("ready");
        setError(null);
      },
      geoError => {
        const nextError = errorFromGeolocation(geoError);
        setStatus(nextError);
        setError(nextError);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, resetKey]);

  return { location, locationRef, status, error };
}
