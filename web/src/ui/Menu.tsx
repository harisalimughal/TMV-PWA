import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { placeMenu, type MenuPlacement } from "./menuPosition";

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
 *  close, focus returns to the trigger.
 *
 *  The list is rendered in a portal on <body> and positioned against the viewport, so a parent
 *  with `overflow: hidden` (a dialog panel, a card) can never clip it. It opens below the trigger
 *  when there is room, otherwise above, and is kept inside the viewport. It follows the trigger on
 *  scroll and resize. Above dialogs (z 90/100) because it is opened from inside them. */
export function Menu({ trigger, items, header, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const triggerId = useId();
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPlacement(null);
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

  // Measure the open list and place it next to the trigger; redo on scroll (any ancestor) and resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current, list = listRef.current;
      if (!trigger || !list) return;
      const box = trigger.getBoundingClientRect();
      setPlacement(placeMenu(box, { width: list.offsetWidth, height: list.scrollHeight }, { width: window.innerWidth, height: window.innerHeight }, align));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, align, items.length]);

  // Focus the active item; when every item is disabled, focus the list itself so Escape and Tab still reach the menu
  // (otherwise focus stays on the trigger and Escape would close the dialog the menu was opened from).
  useEffect(() => {
    if (!open || !placement) return;
    const target = activeIndex >= 0 ? itemRefs.current[activeIndex] : listRef.current;
    (target ?? listRef.current)?.focus({ preventScroll: true });
  }, [open, placement, activeIndex]);

  /** The next enabled item from `from` in direction `step` (wrapping); -1 when every item is disabled. */
  function enabledIndex(from: number, step: 1 | -1): number {
    for (let tries = 0; tries < items.length; tries += 1) {
      const index = (((from + step * tries) % items.length) + items.length) % items.length;
      if (!items[index].disabled) return index;
    }
    return -1;
  }

  function openMenu() {
    setOpen(true);
    setActiveIndex(enabledIndex(0, 1));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(); // focus goes back to the trigger; the browser then moves on from there
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(i => enabledIndex(i + 1, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => enabledIndex(i - 1, -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(enabledIndex(0, 1));
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(enabledIndex(items.length - 1, -1));
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

      {open && createPortal(
        <div
          ref={listRef}
          role="menu"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          style={placement ? { top: placement.top, left: placement.left, maxHeight: placement.maxHeight } : { top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
          className={cx(
            "fixed z-[110] min-w-[220px] outline-none max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface shadow-lg",
            "animate-in fade-in zoom-in-95 motion-reduce:animate-none",
            placement?.side === "top" ? (align === "end" ? "origin-bottom-right" : "origin-bottom-left") : (align === "end" ? "origin-top-right" : "origin-top-left"),
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
        </div>,
        document.body
      )}
    </div>
  );
}
