/**
 * Evidence photos and signatures are real network images (Cloudinary / our own photo
 * proxy). window.print() snapshots whatever has painted so far — if a photo hasn't
 * finished loading yet, the printed/downloaded page comes out with that image blank
 * even though everything else (headers, labels, borders) rendered correctly. Every
 * print trigger in this dashboard used a blind `setTimeout` before calling
 * window.print(), which is exactly this bug waiting to happen on a slow connection or
 * a report with several photos.
 *
 * This waits for every <img> inside the hidden print container to actually finish
 * loading (or fail) before print is triggered, with a ceiling so one stuck image
 * can't hang the download forever.
 */
export function waitForPrintImages(selector = ".print-content", timeoutMs = 8000): Promise<void> {
  const container = document.querySelector(selector);
  if (!container) return Promise.resolve();

  const pending = Array.from(container.querySelectorAll("img")).filter(img => !img.complete);
  if (pending.length === 0) return Promise.resolve();

  return new Promise(resolve => {
    let remaining = pending.length;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const onOne = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };
    for (const img of pending) {
      img.addEventListener("load", onOne, { once: true });
      img.addEventListener("error", onOne, { once: true });
    }
    setTimeout(finish, timeoutMs);
  });
}
