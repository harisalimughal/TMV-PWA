import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";

export interface MenuItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Draws a divider above this item — e.g. to set "Log out" apart. */
  separatorBefore?: boolean;
}

export interface MenuProps {
  /** The button that opens the menu. `render` receives props to spread onto it. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
    id: string;
  }) => React.ReactNode;
  items: MenuItem[];
  /** Extra content above the items (e.g. an identity block). */
  header?: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}

/** Button-triggered action menu. role=menu, arrow-key navigation, Esc + outside-click
 *  close, focus returns to the trigger. */
export function Menu({ trigger, items, header, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        !listRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        close(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openMenu() {
    setOpen(true);
    setActiveIndex(0);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(i => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => (i - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    }
  }

  return (
    <div className="relative inline-flex">
      {trigger({
        ref: triggerRef,
        onClick: () => (open ? close() : openMenu()),
        "aria-expanded": open,
        "aria-haspopup": "menu",
        id: triggerId
      })}

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={onKeyDown}
          className={cx(
            "absolute top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-card border border-line bg-surface shadow-md",
            "animate-in fade-in zoom-in-95",
            align === "end" ? "right-0" : "left-0",
            className
          )}
        >
          {header && <div className="border-b border-line px-3 py-2.5">{header}</div>}
          <div className="p-1">
            {items.map((item, index) => (
              <React.Fragment key={item.id}>
                {item.separatorBefore && <div className="my-1 h-px bg-line" role="none" />}
                <button
                  ref={el => {
                    itemRefs.current[index] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cx(
                    "flex min-h-[40px] w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body",
                    "transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50",
                    "[&_svg]:size-[18px] [&_svg]:shrink-0",
                    item.tone === "danger"
                      ? "text-danger hover:bg-danger-subtle"
                      : "text-fg hover:bg-surface-sunken"
                  )}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
