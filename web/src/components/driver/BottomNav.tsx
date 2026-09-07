import React from "react";
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
 */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
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
              "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-card",
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
