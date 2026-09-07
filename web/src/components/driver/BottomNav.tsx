import React, { useEffect, useRef } from "react";
import { Boxes, ClipboardList, Settings, Truck } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";

export type TabId = "jobs" | "storage" | "van" | "profile";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "jobs", label: "Jobs", icon: ClipboardList },
  { id: "storage", label: "Storage", icon: Boxes },
  { id: "van", label: "Van", icon: Truck },
  { id: "profile", label: "Settings", icon: Settings }
];

export interface BottomNavProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
}

/**
 * The mobile tab bar — a blurred instrument panel with a hairline rule on top.
 * The active tab is marked by a soft brand-tinted glow behind its icon, nothing
 * else is coloured.
 *
 * Publishes its real rendered height (blur bar + safe-area padding included) to
 * `--bottom-nav-h` on <html>, so a tab screen's scroll area can reserve exactly
 * that much room and the last row always clears the bar — see `.scroll-pb-nav`.
 */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => {
      const h = el.offsetHeight;
      if (h > 0) root.style.setProperty("--bottom-nav-h", `${h}px`);
      else root.style.removeProperty("--bottom-nav-h");
    };
    sync();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(sync)
        : null;
    ro?.observe(el);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--bottom-nav-h");
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bar/80 px-2 pt-2 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      {TABS.map(tab => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (!isActive) haptics.tap();
              onSelect(tab.id);
            }}
            className={cx(
              "relative flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 rounded-card",
              "transition-transform duration-fast active:scale-90",
              "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand",
              isActive ? "text-brand" : "text-fg-subtle"
            )}
          >
            <span className="relative grid place-items-center">
              {isActive && (
                <span className="absolute -inset-x-2.5 -inset-y-[7px] rounded-[12px] bg-brand-subtle" aria-hidden />
              )}
              <Icon className="relative size-[22px]" />
            </span>
            <span className={cx("text-[11px]", isActive ? "font-semibold" : "font-medium")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
