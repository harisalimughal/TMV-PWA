/**
 * Motion helpers. Everything here degrades to "final state immediately" for users
 * who prefer reduced motion and in the test environment, so values are never
 * stuck mid-animation for assistive tech or tests.
 */
import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  if (import.meta.env.MODE === "test") return true;
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Recharts animation props: animate on mount unless motion is reduced. */
export function chartMotion(duration = 900) {
  const off = prefersReducedMotion();
  return { isAnimationActive: !off, animationDuration: duration, animationEasing: "ease-out" as const };
}

/** Counts from 0 up to `value` once on mount and eases to later changes. */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    const start = performance.now(), origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (value - origin) * eased;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/** False on first paint, true a frame later: lets CSS transitions draw rings in. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(prefersReducedMotion());
  useEffect(() => {
    if (mounted) return;
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted]);
  return mounted;
}
