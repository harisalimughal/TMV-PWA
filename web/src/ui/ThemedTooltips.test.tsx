import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemedTooltips } from "./ThemedTooltips";

describe("ThemedTooltips", () => {
  afterEach(() => vi.useRealTimers());

  it("replaces the native title bubble with a themed tooltip and keeps the accessible name", () => {
    vi.useFakeTimers();
    render(
      <>
        <ThemedTooltips />
        <button type="button" title="Refresh data">
          <svg aria-hidden="true" />
        </button>
      </>
    );
    const btn = screen.getByRole("button");
    fireEvent.pointerOver(btn, { pointerType: "mouse" });
    // Native title removed immediately so the browser bubble never shows...
    expect(btn).not.toHaveAttribute("title");
    // ...but an icon-only button keeps its name for screen readers.
    expect(btn).toHaveAccessibleName("Refresh data");
    act(() => vi.advanceTimersByTime(400));
    const tip = document.getElementById("tmv-tooltip")!;
    expect(tip).toHaveTextContent("Refresh data");
    expect(tip.dataset.open).toBe("true");
    // Only an open tooltip is exposed; a closed, empty one stays hidden (no nameless role=tooltip).
    expect(tip).not.toHaveAttribute("aria-hidden");
    expect(btn).toHaveAttribute("aria-describedby", "tmv-tooltip");

    fireEvent.pointerOut(btn, { pointerType: "mouse" });
    expect(tip.dataset.open).toBe("false");
    expect(btn).not.toHaveAttribute("aria-describedby");
  });

  it("hides the closed tooltip element from assistive tech", () => {
    render(<ThemedTooltips />);
    expect(document.getElementById("tmv-tooltip")).toHaveAttribute("aria-hidden", "true");
  });

  it("does not overwrite an existing accessible name or aria-describedby", () => {
    render(
      <>
        <ThemedTooltips />
        <p id="hint">Hint</p>
        <button type="button" title="More info" aria-describedby="hint">Details</button>
      </>
    );
    const btn = screen.getByRole("button", { name: "Details" });
    fireEvent.focusIn(btn);
    fireEvent.pointerOver(btn, { pointerType: "mouse" });
    fireEvent.pointerOut(btn, { pointerType: "mouse" });
    expect(btn).toHaveAccessibleName("Details");
    expect(btn).toHaveAttribute("aria-describedby", "hint");
  });

  it("ignores touch", () => {
    render(
      <>
        <ThemedTooltips />
        <button type="button" title="Tip">X</button>
      </>
    );
    fireEvent.pointerOver(screen.getByRole("button"), { pointerType: "touch" });
    expect(screen.getByRole("button")).toHaveAttribute("title", "Tip");
  });

  it("stands down while the admin dashboard is mounted, keeping native titles", () => {
    document.documentElement.classList.add("tmv-admin");
    try {
      render(
        <>
          <ThemedTooltips />
          <button type="button" title="Export">Export</button>
        </>
      );
      fireEvent.pointerOver(screen.getByRole("button"), { pointerType: "mouse" });
      expect(screen.getByRole("button")).toHaveAttribute("title", "Export");
      expect(document.getElementById("tmv-tooltip")?.dataset.open).not.toBe("true");
    } finally {
      document.documentElement.classList.remove("tmv-admin");
    }
  });
});
