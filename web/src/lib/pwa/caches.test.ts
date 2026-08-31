import { describe, expect, it } from "vitest";
import { formatBytes, isSafeToClear } from "./caches";

describe("isSafeToClear", () => {
  it("allows Workbox precache and runtime caches", () => {
    expect(isSafeToClear("workbox-precache-v2-https://chat.themanvan.co.uk/")).toBe(true);
    expect(isSafeToClear("workbox-runtime-https://chat.themanvan.co.uk/")).toBe(true);
    expect(isSafeToClear("vite-pwa-something")).toBe(true);
  });

  it("refuses anything it doesn't recognise", () => {
    expect(isSafeToClear("tmv-outbox")).toBe(false);
    expect(isSafeToClear("keyval-store")).toBe(false);
    expect(isSafeToClear("firebase-messaging")).toBe(false);
    expect(isSafeToClear("random-user-cache")).toBe(false);
    expect(isSafeToClear("")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("renders KB / MB / GB with sensible precision", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-10)).toBe("0 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(44_879_872)).toBe("42.8 MB");
    expect(formatBytes(1_503_238_553)).toBe("1.4 GB");
  });

  it("never reports 0 KB for a non-zero amount", () => {
    expect(formatBytes(200)).toBe("1 KB");
  });
});
