import { describe, expect, it } from "vitest";
import css from "../../adminTheme.css?raw";

// Every admin source file as text (src/ is typed without Node, so Vite's glob reads them).
const SOURCES = import.meta.glob(["../../../**/*.{ts,tsx,css}", "!../../../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("card surfaces", () => {
  it("draws no coloured vertical strip down the side of a card", () => {
    const offenders = Object.entries(SOURCES).filter(([, text]) => /absolute\s+inset-y-0\s+(left|right)-0\s+w-(\d|\[)/.test(text)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });
  it("has no accent pseudo-element on job cards", () => {
    expect(css).not.toMatch(/\.tmv-job-card::before/);
  });
  it("defines the shared card border on all four sides", () => {
    expect(css).toMatch(/\.tmv-card\s*\{[^}]*border:\s*1px solid/);
  });
});
