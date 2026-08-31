import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx, useTheme } from "../../ui";
import type { ThemePreference } from "../../ui";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
];

/**
 * Appearance control — a three-way segmented toggle (Light / Dark / System) with a
 * sliding indicator. Real radio semantics, arrow-key nav, and the indicator drops
 * its transition under prefers-reduced-motion.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const index = Math.max(0, OPTIONS.findIndex(o => o.value === preference));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    setPreference(OPTIONS[(index + dir + OPTIONS.length) % OPTIONS.length].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      onKeyDown={onKeyDown}
      className={cx(
        "relative grid grid-cols-3 rounded-lg border border-line bg-surface-sunken p-1",
        className
      )}
    >
      {/* sliding indicator */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-md bg-surface shadow-xs ring-1 ring-line transition-transform duration-[200ms] ease-out motion-reduce:transition-none"
        style={{ width: "calc((100% - 0.5rem) / 3)", transform: `translateX(calc(${index} * 100%))` }}
      />
      {OPTIONS.map(opt => {
        const Icon = opt.icon;
        const active = opt.value === preference;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setPreference(opt.value)}
            className={cx(
              "relative z-10 flex h-8 items-center justify-center gap-1.5 rounded-md text-meta font-medium transition-colors duration-fast",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              active ? "text-fg" : "text-fg-subtle hover:text-fg-muted"
            )}
          >
            <Icon className="size-4" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact icon button for nav areas — toggles between light and dark (a "system"
 * preference is treated as its current resolved value, then flipped).
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => setPreference(next)}
      className={cx(
        "grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className
      )}
    >
      <span className="relative block size-[18px]">
        <Sun
          className={cx(
            "absolute inset-0 size-[18px] transition-all duration-[200ms] ease-out motion-reduce:transition-none",
            resolved === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          )}
        />
        <Moon
          className={cx(
            "absolute inset-0 size-[18px] transition-all duration-[200ms] ease-out motion-reduce:transition-none",
            resolved === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          )}
        />
      </span>
    </button>
  );
}
