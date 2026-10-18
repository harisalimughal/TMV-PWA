import { describe, expect, it } from "vitest";
import { placeMenu } from "./menuPosition";

const viewport = { width: 1000, height: 700 };
const menu = { width: 220, height: 160 };
const box = (top: number, left: number, w = 80, h = 36) => ({ top, left, right: left + w, bottom: top + h });

describe("placeMenu", () => {
  it("opens below, aligned to the trigger's end, when there is room", () => {
    expect(placeMenu(box(100, 500), menu, viewport, "end")).toMatchObject({ side: "bottom", top: 144, left: 360 });
  });
  it("opens above when the trigger is near the bottom edge (the dialog footer case)", () => {
    const placement = placeMenu(box(650, 880), menu, viewport, "end");
    expect(placement.side).toBe("top");
    expect(placement.top).toBe(650 - 8 - 160);
    expect(placement.top).toBeGreaterThanOrEqual(12);
  });
  it("stays inside the right edge", () => {
    const placement = placeMenu(box(100, 950, 40), menu, viewport, "start");
    expect(placement.left + menu.width).toBeLessThanOrEqual(viewport.width - 12);
  });
  it("stays inside the left edge", () => {
    expect(placeMenu(box(100, 0, 40), menu, viewport, "end").left).toBe(12);
  });
  it("uses the larger side and a max height when neither side fits, so it scrolls instead of being cut", () => {
    const tall = { width: 220, height: 900 };
    const placement = placeMenu(box(300, 400), tall, viewport, "end");
    expect(placement.maxHeight).toBeLessThan(900);
    expect(placement.top).toBeGreaterThanOrEqual(0);
    expect(placement.top + Math.min(900, placement.maxHeight)).toBeLessThanOrEqual(viewport.height);
  });
});
