import { describe, expect, it } from "vitest";
import css from "./adminTheme.css?raw";

/*
 * Guards the Midnight (true black) admin theme. It reads the real stylesheet, so a token
 * edited later is checked here rather than by eye. Data-series colours (blue, cyan and
 * so on) are allowed; only the neutral surface, line and text tokens must be grey.
 */
// Every admin source file as text (src/ is typed without Node, so Vite's glob reads them).
const SOURCES = import.meta.glob(["../**/*.{ts,tsx,css}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const dark = block('html.tmv-admin[data-admin-theme="dark"]');

/** "r g b" triplet or #rrggbb to [r, g, b]. */
function rgb(value: string): [number, number, number] {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const parts = value.replace(/\/\*.*\*\//, "").trim().split(/\s+/).map(Number);
  expect(parts, value).toHaveLength(3);
  return parts as [number, number, number];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const [r, g, bl] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = block("html.tmv-admin,\nhtml.tmv-admin .report-document,\nhtml.tmv-admin #tmv-print-portal");

describe("Aurora Light admin theme (neutral)", () => {
  it("keeps surfaces and lines neutral: a hint of cool grey at most, no lavender (channel spread at most 8; the old #F6F7FF was 9)", () => {
    for (const name of ["--bg", "--bg-2", "--surface", "--surface-sunken", "--surface-raised", "--line", "--line-strong",
      "--chart-grid", "--chart-surface", "--sidebar-bg", "--nav-hover-bg", "--side-card-bg"]) {
      expect(light[name], name).toBeDefined();
      const channels = rgb(light[name]);
      expect(Math.max(...channels) - Math.min(...channels), name).toBeLessThanOrEqual(8);
    }
  });

  it("uses a white surface and sidebar on an off-white canvas", () => {
    expect(rgb(light["--surface"])).toEqual([255, 255, 255]);
    expect(rgb(light["--sidebar-bg"])).toEqual([255, 255, 255]);
    expect(rgb(light["--bg"]).every(channel => channel >= 240 && channel < 255)).toBe(true);
  });

  it("keeps text and status colours at WCAG AA on the darkest light surface", () => {
    const worst = rgb(light["--surface-raised"]);
    for (const name of ["--fg", "--fg-muted", "--fg-subtle", "--brand", "--brand-active", "--success-fg", "--warning-fg", "--danger-fg"]) {
      expect(contrast(rgb(light[name]), worst), name).toBeGreaterThanOrEqual(4.5);
    }
    for (const name of ["--brand-solid", "--brand-hover", "--danger-solid"]) {
      expect(contrast([255, 255, 255], rgb(light[name])), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Midnight admin theme (true black)", () => {
  it("uses a pure black canvas", () => {
    expect(rgb(dark["--bg"])).toEqual([0, 0, 0]);
  });

  it("keeps every neutral surface, line and text token grey (no navy or slate tint)", () => {
    const neutral = ["--bg", "--bg-2", "--surface", "--surface-sunken", "--surface-raised", "--line", "--line-strong",
      "--fg", "--fg-muted", "--fg-subtle", "--chart-grid", "--chart-surface", "--chart-axis",
      "--sidebar-bg", "--nav-hover-bg", "--nav-active-bg", "--nav-tooltip-bg"];
    for (const name of neutral) {
      expect(dark[name], name).toBeDefined();
      const [r, g, b] = rgb(dark[name]);
      expect({ name, r, g, b }).toEqual({ name, r, g: r, b: r });
    }
  });

  it("orders the surfaces from the canvas upwards", () => {
    const level = (name: string) => rgb(dark[name])[0];
    expect(level("--bg")).toBeLessThan(level("--surface"));
    expect(level("--surface")).toBeLessThan(level("--surface-sunken"));
    expect(level("--surface-sunken")).toBeLessThan(level("--surface-raised"));
  });

  it("keeps text and status colours at WCAG AA on the lightest surface", () => {
    const worst = rgb(dark["--surface-raised"]);
    for (const name of ["--fg", "--fg-muted", "--fg-subtle", "--brand", "--brand-active", "--success-fg", "--warning-fg", "--danger-fg"]) {
      expect(contrast(rgb(dark[name]), worst), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps white text on solid fills at WCAG AA", () => {
    for (const name of ["--brand-solid", "--brand-hover", "--danger-solid"]) {
      expect(contrast([255, 255, 255], rgb(dark[name])), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives the shared app Button's brand fill the solid, white-text-safe violet", () => {
    expect(css).toContain("html.tmv-admin .bg-brand { background-color: rgb(var(--brand-solid)); }");
  });

  it("has no navy hex values in admin source (printable paper reports excepted)", () => {
    const banned = /#(0F172A|111827|1E293B|0B1120|101828|172554|0A0C1E|151834|0D1029)\b/i;
    const darkStart = css.indexOf('html.tmv-admin[data-admin-theme="dark"] {');
    expect(css.slice(darkStart, css.indexOf("\n}", darkStart))).not.toMatch(banned);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    const offenders = Object.entries(SOURCES).filter(([path, text]) => !path.endsWith("adminTheme.css") && banned.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
    // Scrims tinted with the ink colour turn white in Midnight; use .tmv-scrim.
    expect(Object.entries(SOURCES).filter(([, text]) => /bg-admin-ink\/\d/.test(text)).map(([path]) => path)).toEqual([]);
  });
});

describe("accessibility contrast (audit)", () => {
  const white: [number, number, number] = [255, 255, 255];
  it("keeps white text on filled danger buttons at AA in both themes", () => {
    expect(contrast(white, rgb(light["--danger-solid"]))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, rgb(dark["--danger-solid"]))).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps the small Midnight nav group labels at AA on the black canvas", () => {
    expect(contrast(rgb(dark["--nav-label"]), [0, 0, 0])).toBeGreaterThanOrEqual(4.5);
  });
});
