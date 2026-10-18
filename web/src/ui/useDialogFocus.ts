import { useEffect, useRef, type RefObject } from "react";

const dialogs: HTMLElement[] = [];
let previousOverflow = "";
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** One stack shared by drawers and modals: only the top dialog owns keyboard focus. */
export function useDialogFocus(open: boolean, panel: RefObject<HTMLDivElement>, onClose: () => void, dismissible = true) {
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const restore = document.activeElement as HTMLElement | null;
    if (!dialogs.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    dialogs.push(element);
    element.focus();
    const keydown = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== element || event.defaultPrevented) return;
      // A menu opened from inside the dialog lives in a portal outside it and handles its own Escape and Tab.
      if ((event.target as HTMLElement | null)?.closest?.('[role="menu"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (latest.current.dismissible) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(node => {
        const style = getComputedStyle(node);
        return !node.closest('[hidden],[inert],[aria-hidden="true"]') && !node.matches(":disabled") && style.display !== "none" && style.visibility !== "hidden";
      });
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); element.focus(); }
      else if (!element.contains(document.activeElement) || document.activeElement === element) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      const wasTop = dialogs[dialogs.length - 1] === element;
      const index = dialogs.indexOf(element);
      if (index >= 0) dialogs.splice(index, 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (wasTop && restore?.isConnected) restore.focus();
    };
  }, [open, panel]);
}
