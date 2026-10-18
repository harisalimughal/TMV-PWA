import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme";

const root = document.documentElement;
afterEach(() => { root.classList.remove("tmv-admin"); root.style.colorScheme = ""; delete root.dataset.theme; localStorage.clear(); });

describe("driver ThemeProvider", () => {
  it("applies the driver theme to the document in the driver app", () => {
    localStorage.setItem("tmv-theme", "dark");
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("leaves the document alone while the admin dashboard owns it", () => {
    // Same origin (localhost, the demo host): a dark driver choice must not give the
    // dashboard an inline color-scheme, which beats the admin stylesheet.
    localStorage.setItem("tmv-theme", "dark");
    root.classList.add("tmv-admin");
    render(<ThemeProvider><div /></ThemeProvider>);
    expect(root.dataset.theme).toBeUndefined();
    expect(root.style.colorScheme).toBe("");
  });
});
