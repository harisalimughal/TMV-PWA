import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * Animates a whole number from its previous value up to `target` with an ease-out
 * curve. On first mount it counts up from 0, so a freshly loaded count ticks into
 * place. Honours `prefers-reduced-motion` (snaps straight to the value) and cancels
 * cleanly on unmount / target change.
 */
export function useCountUp(target: number, durationMs = 480): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(() => (reduced ? target : 0));
  const fromRef = useRef(reduced ? target : 0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced || fromRef.current === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);

  return value;
}
