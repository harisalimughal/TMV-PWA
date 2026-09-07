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
 * Appearance control — a three-way segmented toggle (Light / Dark / System). Real
 * radio semantics, arrow-key nav; the active option takes the raised fill.
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
      className={cx("flex gap-1 rounded-[14px] border border-line bg-surface p-1", className)}
    >
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
              "flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold",
              "transition-[background,color,transform] duration-fast active:scale-[0.95]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              active ? "bg-surface-raised text-fg" : "text-fg-muted"
            )}
          >
            <Icon className="size-[15px]" />
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
        "grid size-11 place-items-center rounded-pill text-fg-muted transition-[background,transform] duration-fast active:scale-90 active:bg-surface-raised",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className
      )}
    >
      <span className="relative block size-[19px]">
        <Sun
          className={cx(
            "absolute inset-0 size-[19px] transition-all duration-[240ms] ease-out motion-reduce:transition-none",
            resolved === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          )}
        />
        <Moon
          className={cx(
            "absolute inset-0 size-[19px] transition-all duration-[240ms] ease-out motion-reduce:transition-none",
            resolved === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          )}
        />
      </span>
    </button>
  );
}
