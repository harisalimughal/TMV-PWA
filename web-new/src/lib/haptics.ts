/**
 * Tiny haptic helper. Android/Chrome supports navigator.vibrate; iOS Safari does not,
 * where this is a silent no-op. Used only to confirm a committed action (photo taken,
 * step submitted) -- never for errors the driver can already see.
 */
function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* some browsers throw if the document isn't focused */
  }
}

export const haptics = {
  tap: () => buzz(8),
  success: () => buzz([12, 40, 12]),
  warn: () => buzz([24, 60, 24])
};
