import React from "react";
import { Boxes, ClipboardList, UserRound } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";

export type TabId = "jobs" | "storage" | "profile";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "jobs", label: "Jobs", icon: ClipboardList },
  { id: "storage", label: "Storage", icon: Boxes },
  { id: "profile", label: "Profile", icon: UserRound }
];

export interface BottomNavProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
}

/**
 * The mobile tab bar — an instrument panel, not an iOS clone. Edge-to-edge, a
 * heavy rule on top, and the active tab marked by a solid brand-blue bar above
 * its icon. No pill, no tinted capsule.
 */
export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(tab => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (!isActive) haptics.tap();
                  onSelect(tab.id);
                }}
                className={cx(
                  "relative flex h-[58px] w-full flex-col items-center justify-center gap-1",
                  "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand",
                  isActive ? "text-brand" : "text-fg-subtle"
                )}
              >
                <span
                  className={cx(
                    "absolute inset-x-5 top-0 h-[2px] rounded-b transition-colors",
                    isActive ? "bg-brand" : "bg-transparent"
                  )}
                  aria-hidden
                />
                <Icon className="size-[21px]" />
                <span className={cx("text-nav", isActive ? "font-semibold" : "font-medium")}>
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
