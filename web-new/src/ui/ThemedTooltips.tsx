import { useEffect } from "react";
import { isAdminDocument } from "../lib/adminHost";

const SHOW_DELAY_MS = 350;
const GAP = 8;
const ATTR = "data-tmv-title";

/**
 * App-wide replacement for the browser's native `title=""` tooltip bubble, which
 * ignores the theme (pale grey box, OS font, long fixed delay). Mount once.
 *
 * On first hover/focus of an element with a `title`, the text moves into
 * `data-tmv-title` (so the native bubble never appears) and a themed tooltip is
 * shown instead. When the title was the element's only accessible name (icon-only
 * buttons), it is copied into `aria-label` first so screen readers lose nothing.
 * Touch input is ignored — touch devices never showed title bubbles either.
 */
export function ThemedTooltips() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const tip = document.createElement("div");
    tip.className = "tmv-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.id = "tmv-tooltip";
    // Closed and empty: hidden from assistive tech (an empty role=tooltip has no name).
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);

    let target: Element | null = null;
    let addedDescribedBy = false;
    let timer: number | undefined;

    const harvest = (el: Element): string | null => {
      const fresh = el.getAttribute("title");
      if (fresh !== null) {
        if (fresh.trim()) {
          const hasName = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.textContent ?? "").trim();
          if (!hasName) el.setAttribute("aria-label", fresh);
          el.setAttribute(ATTR, fresh);
        } else {
          el.removeAttribute(ATTR);
        }
        el.removeAttribute("title");
      }
      const text = el.getAttribute(ATTR);
      return text && text.trim() ? text : null;
    };

    const findHost = (node: EventTarget | null): Element | null => {
      if (!(node instanceof Element)) return null;
      // Driver app only: the admin dashboard keeps the native title tooltips.
      if (isAdminDocument()) return null;
      return node.closest(`[title], [${ATTR}]`);
    };

    const place = (el: Element) => {
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top = r.bottom + GAP;
      if (top + t.height > vh - 4) top = Math.max(4, r.top - GAP - t.height);
      const left = Math.min(Math.max(4, r.left + r.width / 2 - t.width / 2), vw - t.width - 4);
      tip.style.top = `${Math.round(top)}px`;
      tip.style.left = `${Math.round(left)}px`;
    };

    const hide = () => {
      window.clearTimeout(timer);
      if (target && addedDescribedBy) target.removeAttribute("aria-describedby");
      addedDescribedBy = false;
      target = null;
      tip.dataset.open = "false";
      tip.setAttribute("aria-hidden", "true");
    };

    const show = (el: Element, immediate: boolean) => {
      const text = harvest(el);
      if (!text) return hide();
      hide();
      target = el;
      const open = () => {
        if (target !== el || !el.isConnected) return;
        tip.textContent = text;
        tip.dataset.open = "true";
        tip.removeAttribute("aria-hidden");
        if (!el.hasAttribute("aria-describedby")) {
          el.setAttribute("aria-describedby", tip.id);
          addedDescribedBy = true;
        }
        place(el);
      };
      if (immediate) open();
      else timer = window.setTimeout(open, SHOW_DELAY_MS);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const host = findHost(e.target);
      if (host === target) return;
      if (!host) return hide();
      // Harvest immediately so the native bubble can't win the race on slow hovers.
      harvest(host);
      show(host, false);
    };
    const onOut = (e: PointerEvent) => {
      if (!target) return;
      const to = e.relatedTarget as Node | null;
      if (to && target.contains(to)) return;
      hide();
    };
    const onFocus = (e: FocusEvent) => {
      const host = findHost(e.target);
      if (host && (e.target as Element).matches?.(":focus-visible")) show(host, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      tip.remove();
    };
  }, []);
  return null;
}
