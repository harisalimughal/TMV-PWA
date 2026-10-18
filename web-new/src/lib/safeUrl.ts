/**
 * Where a notification may send the app. Only this site's own pages: a push payload is data
 * from outside the browser, and navigating to whatever URL it names would let a bad or buggy
 * sender redirect a driver to another site. Anything that is not same-origin becomes "/".
 *

 * `base` is where relative links resolve from (the current page in the app; the site root in the worker),
 * so a bare "#section" keeps working on the page the driver is on.
 *
 * `public/push-worker.js` carries a copy of this function (a service worker cannot import app
 * modules); `safeUrl.test.ts` checks that the copy behaves the same.
 */
export function safeInternalUrl(raw: unknown, origin: string, base: string = origin): string {
  if (typeof raw !== "string" || !raw.trim()) return "/";
  try {
    const url = new URL(raw.trim(), base);
    if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
