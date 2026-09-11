import { useEffect, useRef } from "react";
import type { CapturedLocation } from "../../lib/geo";

/**
 * Keeps the driver's latest known position in a ref while `active` (the camera modal
 * being open), so a location is usually already on hand the instant the shutter fires
 * instead of the capture having to wait on a fresh GPS fix. Purely best-effort: no
 * permission prompt UI here (unlike the camera's), and any failure — denied, no GPS,
 * unsupported browser, timeout — just leaves the ref at null forever. Reading it is
 * always safe and never blocks or fails a photo capture.
 */
export function useLocationWatch(active: boolean): React.RefObject<CapturedLocation | null> {
  const locationRef = useRef<CapturedLocation | null>(null);

  useEffect(() => {
    locationRef.current = null;
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      position => {
        locationRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
      },
      () => {
        /* Denied / unavailable / timed out — stay null, the photo still works. */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);

  return locationRef;
}
