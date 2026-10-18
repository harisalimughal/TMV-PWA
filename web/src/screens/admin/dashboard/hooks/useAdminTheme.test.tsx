import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveAdminTheme, setAdminThemePreference, useAdminTheme } from "./useAdminTheme";

describe("resolveAdminTheme", () => {
  it("honours an explicit choice regardless of the system", () => {
    expect(resolveAdminTheme("light", true)).toBe("light");
    expect(resolveAdminTheme("dark", false)).toBe("dark");
  });
  it("follows the system when no explicit choice was made", () => {
    expect(resolveAdminTheme("system", true)).toBe("dark");
    expect(resolveAdminTheme("system", false)).toBe("light");
  });
});

describe("useAdminTheme on <html>", () => {
  it("keeps the theme while any user is mounted and clears it after the last one", () => {
    setAdminThemePreference("dark");
    const Probe = () => { useAdminTheme(); return null; };
    const app = render(<Probe />);
    const layout = render(<Probe />);
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    layout.unmount(); // signing out unmounts the dashboard Layout; AdminApp stays mounted
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    app.unmount();
    expect(document.documentElement.dataset.adminTheme).toBeUndefined();
  });

  it("follows a change of preference", () => {
    const Probe = () => { useAdminTheme(); return null; };
    const view = render(<Probe />);
    act(() => setAdminThemePreference("light"));
    expect(document.documentElement.dataset.adminTheme).toBe("light");
    act(() => setAdminThemePreference("dark"));
    expect(document.documentElement.dataset.adminTheme).toBe("dark");
    view.unmount();
  });
});
