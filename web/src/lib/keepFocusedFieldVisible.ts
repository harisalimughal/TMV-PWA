/**
 * When the on-screen keyboard opens, make sure the focused field isn't left hidden
 * behind it or behind a step's sticky dock. `interactive-widget=resizes-content`
 * (index.html) shrinks the layout on Chrome/Android; this nudges the field back into
 * view once the resize settles. iOS Safari already does this natively, but the extra
 * scroll is harmless there. Driver app only: skipped while the admin dashboard is
 * mounted, where a focused desktop field must not jump the page.
 */
import { isAdminDocument } from "./adminHost";

const TEXT_INPUT = /^(INPUT|TEXTAREA|SELECT)$/;
const NON_TEXT_TYPES = new Set(["checkbox", "radio", "button", "submit", "file", "range", "color"]);

export function isKeyboardField(el: Element | null): el is HTMLElement {
  if (!el || !TEXT_INPUT.test(el.tagName)) return false;
  if (el.tagName === "INPUT" && NON_TEXT_TYPES.has((el as HTMLInputElement).type)) return false;
  return true;
}

export function installKeepFocusedFieldVisible(win: Window = window): () => void {
  let timer: number | undefined;
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as Element | null;
    if (!isKeyboardField(target) || isAdminDocument(win.document)) return;
    win.clearTimeout(timer);
    // Wait for the keyboard animation + viewport resize before measuring.
    timer = win.setTimeout(() => {
      if (win.document.activeElement === target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 320);
  };
  win.document.addEventListener("focusin", onFocusIn);
  return () => {
    win.clearTimeout(timer);
    win.document.removeEventListener("focusin", onFocusIn);
  };
}
