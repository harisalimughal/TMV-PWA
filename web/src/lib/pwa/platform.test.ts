import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserSupportsInstallPrompt,
  getPlatform,
  isInAppBrowser,
  isIos,
  isIosSafari,
  isStandalone,
} from "./platform";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DESKTOP_FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";
const FB_IN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/470.0]";

function setUA(ua: string, platform = "", maxTouchPoints = 0) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

function setDisplayMode(mode: "standalone" | "browser") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mode === "standalone" && query.includes("standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUA(DESKTOP_CHROME);
});

describe("getPlatform", () => {
  it("identifies iOS from an iPhone UA", () => {
    setUA(IOS_SAFARI);
    expect(getPlatform()).toBe("ios");
  });

  it("identifies iPadOS masquerading as desktop Safari via touch points", () => {
    setUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
      "MacIntel",
      5,
    );
    expect(isIos()).toBe(true);
    expect(getPlatform()).toBe("ios");
  });

  it("identifies Android", () => {
    setUA(ANDROID_CHROME);
    expect(getPlatform()).toBe("android");
  });

  it("identifies desktop", () => {
    setUA(DESKTOP_CHROME);
    expect(getPlatform()).toBe("desktop");
  });
});

describe("isIosSafari", () => {
  it("is true for genuine iOS Safari", () => {
    setUA(IOS_SAFARI);
    expect(isIosSafari()).toBe(true);
  });

  it("is false for Chrome on iOS (CriOS)", () => {
    setUA(IOS_CHROME);
    expect(isIosSafari()).toBe(false);
  });

  it("is false on Android", () => {
    setUA(ANDROID_CHROME);
    expect(isIosSafari()).toBe(false);
  });
});

describe("isInAppBrowser", () => {
  it("detects the Facebook in-app browser", () => {
    setUA(FB_IN_APP);
    expect(isInAppBrowser()).toBe(true);
  });

  it("is false for a normal desktop browser", () => {
    setUA(DESKTOP_CHROME);
    expect(isInAppBrowser()).toBe(false);
  });
});

describe("isStandalone", () => {
  it("is true when the standalone display-mode media query matches", () => {
    setUA(ANDROID_CHROME);
    setDisplayMode("standalone");
    expect(isStandalone()).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    setUA(ANDROID_CHROME);
    setDisplayMode("browser");
    expect(isStandalone()).toBe(false);
  });
});

describe("browserSupportsInstallPrompt", () => {
  it("reflects presence of onbeforeinstallprompt on window", () => {
    const had = "onbeforeinstallprompt" in window;
    expect(browserSupportsInstallPrompt()).toBe(had);
  });
});

describe("desktop Firefox", () => {
  it("is desktop and not an in-app browser", () => {
    setUA(DESKTOP_FIREFOX);
    expect(getPlatform()).toBe("desktop");
    expect(isInAppBrowser()).toBe(false);
    expect(isIos()).toBe(false);
  });
});
