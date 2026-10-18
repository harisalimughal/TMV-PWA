import { describe, expect, it } from "vitest";
import css from "./bookingTheme.css?raw";

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/(--bos-[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
const light = tokens(".bos");
const dark = { ...light, ...tokens('html.tmv-admin[data-admin-theme="dark"] .bos') };

const rgb = (hex: string): [number, number, number] => [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16)) as [number, number, number];
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe.each([["light", light], ["dark", dark]] as const)("Booking OS %s tokens", (name, t) => {
  const surfaces = ["--bos-canvas", "--bos-surface", "--bos-surface-2"];
  it("keeps body text at AA on every surface", () => {
    for (const surface of surfaces) for (const ink of ["--bos-ink", "--bos-ink-2", "--bos-ink-3"]) expect(contrast(t[ink], t[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps accent text at AA on surfaces and on its own soft fill", () => {
    for (const accent of ["azure", "cyan", "violet", "emerald", "amber", "coral"]) {
      for (const surface of surfaces) expect(contrast(t[`--bos-${accent}-fg`], t[surface]), `${accent} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[`--bos-${accent}-fg`], t[`--bos-${accent}-soft`]), `${accent} on soft`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps the primary button label readable", () => {
    expect(contrast(t["--bos-on-accent"], t["--bos-primary"]), name).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Booking OS palette", () => {
  it("uses the specified accents for fills", () => {
    expect([light["--bos-azure"], light["--bos-cyan"], light["--bos-violet"], light["--bos-emerald"], light["--bos-amber"], light["--bos-coral"]]).toEqual(["#258BFF", "#20C5E8", "#7959F5", "#16B887", "#F4AC45", "#F16870"]);
  });
  it("is warm ivory in light and true black with grey steps in dark", () => {
    expect(light["--bos-canvas"]).toBe("#FAF7F0");
    expect([dark["--bos-canvas"], dark["--bos-surface"], dark["--bos-surface-2"]]).toEqual(["#080808", "#121212", "#191919"]);
    for (const key of ["--bos-canvas", "--bos-surface", "--bos-surface-2", "--bos-surface-3", "--bos-line", "--bos-line-strong"]) {
      const [r, g, b] = rgb(dark[key]);
      expect([r, g]).toEqual([g, b]);
    }
  });
});
