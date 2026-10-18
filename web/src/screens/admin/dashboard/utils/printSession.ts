/**
 * One browser print of an on-page document, from start to cleanup.
 *
 * What a browser really does around window.print() differs, so nothing here relies on one signal:
 *   - Desktop Chrome and Firefox block inside print() until the dialog closes, then fire `afterprint`.
 *   - Safari and mobile browsers may return from print() at once, and `afterprint` can come late,
 *     twice or (on some versions) not at all.
 * So the document is kept in place until the first of: `afterprint`, the print media query turning off
 * after it was on, or a long safety timeout (default 2 minutes). Returning from print() is never taken
 * as "finished". Cleanup (body class and the original tab title) is idempotent and always runs, also when
 * printing throws. Only one session can be active; a second request while one is running gets the same
 * promise instead of scheduling another print.
 *
 * The tab title is set while printing because most browsers suggest it as the "Save as PDF" file name. The
 * user's browser controls that dialog, so the name is a hint, not a guarantee. The Download PDF action,
 * which writes the file itself, is the one with a guaranteed name.
 */
export interface PrintOptions {
  /** Suggested file name (without extension) while the print dialog is open. */
  title?: string;
  /** Resolves when the document is ready to capture (images loaded). */
  ready?: () => Promise<unknown>;
  /** Defaults to window.print. */
  print?: () => void;
  fallbackMs?: number;
  win?: Window;
}

let active: Promise<void> | null = null;
export const isPrinting = () => active !== null;

export function printDocument(options: PrintOptions = {}): Promise<void> {
  if (active) return active;
  const win = options.win ?? window, doc = win.document;
  const previousTitle = doc.title;
  active = new Promise<void>((resolve, reject) => {
    let finished = false, printed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const media = typeof win.matchMedia === "function" ? win.matchMedia("print") : null;
    const onMedia = (event: { matches: boolean }) => { if (printed && !event.matches) finish(); };
    const onAfter = () => finish();
    function finish(error?: unknown) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      win.removeEventListener("afterprint", onAfter);
      media?.removeEventListener?.("change", onMedia);
      doc.body.classList.remove("printing-report");
      if (options.title) doc.title = previousTitle;
      active = null;
      if (error) reject(error); else resolve();
    }
    doc.body.classList.add("printing-report");
    if (options.title) doc.title = options.title;
    win.addEventListener("afterprint", onAfter);
    media?.addEventListener?.("change", onMedia);
    (async () => {
      try {
        await options.ready?.();
        // Two frames, so the portal has been laid out before the browser captures it.
        await Promise.race([new Promise<void>(r => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r()))), new Promise<void>(r => setTimeout(r, 500))]);
        if (finished) return;
        printed = true;
        timer = setTimeout(() => finish(), options.fallbackMs ?? 120_000);
        (options.print ?? (() => win.print()))();
      } catch (error) { finish(error); }
    })();
  });
  return active;
}
