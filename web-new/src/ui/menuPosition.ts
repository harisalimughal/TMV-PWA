/**
 * Where a floating menu goes: next to its trigger, inside the viewport.
 *
 * Opens below the trigger when there is room, otherwise above (whichever side has more space when
 * neither fits, with a max height so the menu scrolls instead of being cut off). Horizontally it lines up
 * with the trigger's end or start edge, then is pushed back inside the viewport.
 */
export interface Box { top: number; right: number; bottom: number; left: number }
export interface Size { width: number; height: number }
export interface MenuPlacement { top: number; left: number; side: "bottom" | "top"; maxHeight: number }

export function placeMenu(trigger: Box, menu: Size, viewport: Size, align: "start" | "end", gap = 8, padding = 12): MenuPlacement {
  const below = viewport.height - trigger.bottom - gap - padding;
  const above = trigger.top - gap - padding;
  const side: "bottom" | "top" = menu.height <= below || below >= above ? "bottom" : "top";
  const room = Math.max(0, side === "bottom" ? below : above);
  const height = Math.min(menu.height, room);
  const top = side === "bottom" ? trigger.bottom + gap : trigger.top - gap - height;
  const wanted = align === "end" ? trigger.right - menu.width : trigger.left;
  const left = Math.max(padding, Math.min(wanted, viewport.width - padding - menu.width));
  return { top, left, side, maxHeight: room };
}
