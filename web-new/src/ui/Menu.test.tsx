import React, { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "./Menu";
import { useDialogFocus } from "./useDialogFocus";

const rect = (top: number, left: number, w = 80, h = 36) => ({ top, left, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** jsdom has no layout: give the trigger a position and the list a size. */
function layout(triggerAt: DOMRect, list = { w: 220, h: 120 }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) { return this.getAttribute("aria-haspopup") ? triggerAt : rect(0, 0, 0, 0); });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.getAttribute?.("role") === "menu" ? list.w : 0; } });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get() { return this.getAttribute?.("role") === "menu" ? list.h : 0; } });
}

const items = (onSelect: () => void = vi.fn()) => [{ id: "a", label: "Mark as finished", onSelect }, { id: "b", label: "Delete", onSelect: vi.fn(), tone: "danger" as const, separatorBefore: true }];
const view = (onSelect?: () => void) => render(
  <div style={{ overflow: "hidden", height: 40 }} data-testid="clip">
    <Menu align="end" trigger={props => <button {...props}>More</button>} items={items(onSelect)} />
  </div>
);

afterEach(() => { vi.restoreAllMocks(); });

describe("Menu", () => {
  it("renders in a portal on body, so an overflow:hidden parent cannot clip it", () => {
    layout(rect(100, 400));
    view();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId("clip")).not.toContainElement(menu);
    expect(menu.style.position === "" ? menu.className : "fixed").toMatch(/fixed/);
  });

  it("opens below the trigger when there is room, aligned to its right edge", () => {
    layout(rect(100, 400));
    view();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = screen.getByRole("menu");
    expect(menu.style.top).toBe("144px");
    expect(menu.style.left).toBe("260px");
  });

  it("opens above the trigger when it is at the bottom of the screen (the dialog footer case)", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 700 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    layout(rect(660, 900));
    view();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = screen.getByRole("menu");
    expect(parseFloat(menu.style.top)).toBe(660 - 8 - 120);
    expect(parseFloat(menu.style.left) + 220).toBeLessThanOrEqual(1000 - 12);
  });

  it("runs the chosen action and closes; Escape closes and returns focus to the trigger", () => {
    layout(rect(100, 400));
    const onSelect = vi.fn();
    view(onSelect);
    const trigger = screen.getByRole("button", { name: "More" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as finished" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click and keeps the danger item separated", () => {
    layout(rect(100, 400));
    view();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Delete" }).className).toMatch(/text-danger/);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation", () => {
    layout(rect(100, 400));
    view();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Mark as finished" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });
});

describe("Menu with disabled items", () => {
  it("skips disabled items for focus and arrows, and still handles Escape when every item is disabled", () => {
    layout(rect(100, 400));
    const all = [{ id: "a", label: "A", onSelect: vi.fn(), disabled: true }];
    const { unmount } = render(<Menu trigger={props => <button {...props}>More</button>} items={all} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menu")).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    unmount();
    const mixed = [{ id: "a", label: "A", onSelect: vi.fn(), disabled: true }, { id: "b", label: "B", onSelect: vi.fn() }, { id: "c", label: "C", onSelect: vi.fn() }];
    render(<Menu trigger={props => <button {...props}>More</button>} items={mixed} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "B" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "C" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "B" })).toHaveFocus();
  });
});

describe("Menu inside a dialog", () => {
  function Dialog({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useDialogFocus(true, ref, onClose);
    return <div ref={ref} tabIndex={-1} role="dialog" aria-label="d" style={{ overflow: "hidden" }}><Menu trigger={props => <button {...props}>More</button>} items={items()} /></div>;
  }
  it("Escape closes only the menu, not the dialog", () => {
    layout(rect(100, 400));
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Mark as finished" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "More" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
