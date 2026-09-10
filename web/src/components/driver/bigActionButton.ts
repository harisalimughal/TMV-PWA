/**
 * The shared visual identity for the app's biggest primary action — the bright
 * blue, low-radius, elevated pill used for "View Job" on the Jobs list and
 * "I'm on my way" at the start of a job. It is a raw class string (not a
 * component) so each call site keeps its own element, icon and layout margins.
 */
export const bigActionButtonClass =
  "inline-flex min-h-[58px] w-full items-center justify-center gap-2 rounded-[10px] " +
  "bg-gradient-to-b from-[#4F97FF] to-[#2563EB] text-[17px] font-bold text-white " +
  "shadow-[0_8px_20px_-6px_rgb(37_99_235/0.55)] transition-transform duration-fast " +
  "active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
