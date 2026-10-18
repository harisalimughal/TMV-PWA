import { useEffect, type RefObject } from "react";

/**
 * Segmented controls (`.tmv-segmented`, see adminTheme.css) keep one line and scroll
 * sideways below 640px instead of wrapping. This keeps the selected option in view
 * when it changes, scrolling only the control itself, never the page.
 */
export function useKeepSelectedVisible(container: RefObject<HTMLElement>, selectedIndex: number) {
  useEffect(() => {
    const box = container.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const item = box.children[selectedIndex] as HTMLElement | undefined;
    if (!item) return;
    const left = item.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft, right = left + item.offsetWidth;
    if (left < box.scrollLeft) box.scrollLeft = Math.max(0, left - 8);
    else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth + 8;
  }, [container, selectedIndex]);
}
