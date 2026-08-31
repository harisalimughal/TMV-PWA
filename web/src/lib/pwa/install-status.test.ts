import { describe, expect, it } from "vitest";
import {
  describeInstallStatus,
  resolveInstallStatus,
  type InstallEnv,
} from "./install-status";

const base: InstallEnv = {
  installed: false,
  canPrompt: false,
  platform: "desktop",
  iosSafari: false,
  chromium: true,
};

describe("resolveInstallStatus", () => {
  it("'installed' wins over everything else", () => {
    expect(resolveInstallStatus({ ...base, installed: true, canPrompt: true })).toBe(
      "installed",
    );
  });

  it("'installable' when a prompt has been captured", () => {
    expect(resolveInstallStatus({ ...base, canPrompt: true })).toBe("installable");
  });

  it("iOS Safari, not installed → 'ios-safari'", () => {
    expect(
      resolveInstallStatus({ ...base, platform: "ios", iosSafari: true, chromium: false }),
    ).toBe("ios-safari");
  });

  it("iOS non-Safari → 'ios-other-browser'", () => {
    expect(
      resolveInstallStatus({ ...base, platform: "ios", iosSafari: false, chromium: false }),
    ).toBe("ios-other-browser");
  });

  it("Chromium without a prompt → 'needs-browser-menu'", () => {
    expect(resolveInstallStatus({ ...base, platform: "android", chromium: true })).toBe(
      "needs-browser-menu",
    );
  });

  it("non-Chromium desktop (e.g. Firefox) → 'unsupported'", () => {
    expect(resolveInstallStatus({ ...base, platform: "desktop", chromium: false })).toBe(
      "unsupported",
    );
  });
});

describe("describeInstallStatus", () => {
  it("covers every status with a label and tone", () => {
    const statuses = [
      "installed",
      "installable",
      "ios-safari",
      "ios-other-browser",
      "needs-browser-menu",
      "unsupported",
    ] as const;
    for (const s of statuses) {
      const p = describeInstallStatus(s);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.detail.length).toBeGreaterThan(0);
      expect(p.tone).toBeTruthy();
    }
  });

  it("maps the spec's five display states", () => {
    expect(describeInstallStatus("installed").label).toBe("Installed");
    expect(describeInstallStatus("installable").label).toBe("Available to install");
    expect(describeInstallStatus("needs-browser-menu").label).toBe(
      "Browser install prompt unavailable",
    );
    expect(describeInstallStatus("ios-other-browser").label).toBe(
      "Open in Safari to install",
    );
    expect(describeInstallStatus("unsupported").label).toBe("Installation not supported");
  });
});
