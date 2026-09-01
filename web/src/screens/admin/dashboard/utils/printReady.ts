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
 *
 * The timeout ceiling matters more than it looks: `thumbProxyUrl` (db/mongo.ts /
 * storage/cloudinary.ts) is misnamed -- it's the full-resolution original, not an
 * actual Cloudinary thumbnail transform. A single evidence photo is commonly
 * 300-450KB, and a report has up to four of them (three evidence categories plus a
 * signature) loading in parallel. Measured ~1-3.5s per image each on a plain
 * broadband connection; a slower one (mobile data, a busy site) easily pushes the
 * total past a few seconds. 8s was tight enough to be hit in practice -- the report
 * would then print with whatever hadn't finished yet still blank, which is exactly
 * the bug this function exists to prevent. 25s is a real ceiling only a stuck/dead
 * request should ever reach, not typical load time.
 */
export function waitForPrintImages(selector = "#tmv-print-portal, .print-content", timeoutMs = 25000): Promise<void> {
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
