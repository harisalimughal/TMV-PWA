import { afterEach, describe, expect, it, vi } from "vitest";
import { installKeepFocusedFieldVisible, isKeyboardField } from "./keepFocusedFieldVisible";

describe("keepFocusedFieldVisible", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("treats text-like inputs as keyboard fields, but not checkboxes or buttons", () => {
    const text = document.createElement("input");
    const box = Object.assign(document.createElement("input"), { type: "checkbox" });
    expect(isKeyboardField(text)).toBe(true);
    expect(isKeyboardField(document.createElement("textarea"))).toBe(true);
    expect(isKeyboardField(box)).toBe(false);
    expect(isKeyboardField(document.createElement("button"))).toBe(false);
  });

  it("scrolls the focused field into view after the keyboard settles", () => {
    vi.useFakeTimers();
    const input = document.createElement("input");
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    document.body.appendChild(input);
    const uninstall = installKeepFocusedFieldVisible();
    input.focus();
    expect(scroll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    uninstall();
  });

  it("leaves focused fields alone while the admin dashboard is mounted", () => {
    vi.useFakeTimers();
    document.documentElement.classList.add("tmv-admin");
    const input = document.createElement("input");
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    document.body.appendChild(input);
    const uninstall = installKeepFocusedFieldVisible();
    try {
      input.focus();
      vi.advanceTimersByTime(400);
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      uninstall();
      document.documentElement.classList.remove("tmv-admin");
    }
  });
});
