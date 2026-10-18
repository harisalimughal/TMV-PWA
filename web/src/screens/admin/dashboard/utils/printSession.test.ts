import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrinting, printDocument } from "./printSession";

/** A window stand-in whose print() and afterprint the test controls. */
function fakeWindow(options: { printThrows?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const media = { matches: false, listeners: new Set<(event: { matches: boolean }) => void>(), addEventListener(_: string, fn: (event: { matches: boolean }) => void) { this.listeners.add(fn); }, removeEventListener(_: string, fn: (event: { matches: boolean }) => void) { this.listeners.delete(fn); } };
  const win = {
    document,
    print: vi.fn(() => { if (options.printThrows) throw new Error("blocked"); }),
    matchMedia: () => media,
    requestAnimationFrame: (fn: () => void) => { queueMicrotask(fn); return 0; },
    addEventListener: (name: string, fn: () => void) => { (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn); },
    removeEventListener: (name: string, fn: () => void) => { listeners.get(name)?.delete(fn); }
  };
  return { win: win as unknown as Window, print: win.print, media, fire: (name: string) => listeners.get(name)?.forEach(fn => fn()), count: (name: string) => listeners.get(name)?.size ?? 0 };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 20));

afterEach(() => { document.body.className = ""; document.title = "Dashboard"; vi.useRealTimers(); });

describe("print session", () => {
  it("keeps the document in place until afterprint, then restores the page and the tab title", async () => {
    document.title = "Overview · TMV Admin";
    const fake = fakeWindow();
    const done = vi.fn();
    const promise = printDocument({ win: fake.win, title: "tmv-driver-jobs-KA" }).then(done);
    expect(document.body.classList.contains("printing-report")).toBe(true);
    expect(document.title).toBe("tmv-driver-jobs-KA");
    await flush();
    expect(fake.print).toHaveBeenCalledTimes(1);
    // print() having returned is not the end: the portal stays until the lifecycle says so.
    expect(document.body.classList.contains("printing-report")).toBe(true);
    expect(done).not.toHaveBeenCalled();
    fake.fire("afterprint");
    await promise;
    expect(document.body.classList.contains("printing-report")).toBe(false);
    expect(document.title).toBe("Overview · TMV Admin");
    expect(isPrinting()).toBe(false);
    expect(fake.count("afterprint")).toBe(0);
  });

  it("waits for the document to be ready (images) before printing", async () => {
    const fake = fakeWindow(); let release!: () => void;
    const promise = printDocument({ win: fake.win, ready: () => new Promise<void>(resolve => { release = resolve; }) });
    await flush();
    expect(fake.print).not.toHaveBeenCalled();
    release(); await flush();
    expect(fake.print).toHaveBeenCalledTimes(1);
    fake.fire("afterprint"); await promise;
  });

  it("joins a second request made while one is active instead of printing twice", async () => {
    const fake = fakeWindow();
    const first = printDocument({ win: fake.win }), second = printDocument({ win: fake.win });
    expect(second).toBe(first);
    await flush();
    expect(fake.print).toHaveBeenCalledTimes(1);
    fake.fire("afterprint"); await first;
    // After it ends, a new print is allowed.
    const third = printDocument({ win: fake.win }); await flush();
    expect(fake.print).toHaveBeenCalledTimes(2);
    fake.fire("afterprint"); await third;
  });

  it("cleans up and rejects when printing throws", async () => {
    const fake = fakeWindow({ printThrows: true });
    document.title = "Before";
    await expect(printDocument({ win: fake.win, title: "x" })).rejects.toThrow("blocked");
    expect(document.body.classList.contains("printing-report")).toBe(false);
    expect(document.title).toBe("Before");
    expect(isPrinting()).toBe(false);
  });

  it("cleans up and rejects when the document never becomes ready", async () => {
    const fake = fakeWindow();
    await expect(printDocument({ win: fake.win, ready: () => Promise.reject(new Error("images failed")) })).rejects.toThrow("images failed");
    expect(document.body.classList.contains("printing-report")).toBe(false);
    expect(fake.print).not.toHaveBeenCalled();
  });

  it("also finishes when the print media query turns off after printing (browsers with unreliable afterprint)", async () => {
    const fake = fakeWindow();
    const promise = printDocument({ win: fake.win }); await flush();
    fake.media.listeners.forEach(fn => fn({ matches: true }));   // entering print: not the end
    expect(isPrinting()).toBe(true);
    fake.media.listeners.forEach(fn => fn({ matches: false }));  // leaving print
    await promise;
    expect(document.body.classList.contains("printing-report")).toBe(false);
  });

  it("falls back to a timeout if no lifecycle event ever arrives, and removes its listeners", async () => {
    const fake = fakeWindow();
    const promise = printDocument({ win: fake.win, fallbackMs: 30 });
    await promise;
    expect(document.body.classList.contains("printing-report")).toBe(false);
    expect(fake.count("afterprint")).toBe(0);
    expect(fake.media.listeners.size).toBe(0);
  });

  it("ignores a late afterprint after it already finished", async () => {
    const fake = fakeWindow();
    const promise = printDocument({ win: fake.win }); await flush();
    fake.fire("afterprint"); await promise;
    document.body.classList.add("printing-report");   // something else started
    fake.fire("afterprint");
    expect(document.body.classList.contains("printing-report")).toBe(true);
  });
});
