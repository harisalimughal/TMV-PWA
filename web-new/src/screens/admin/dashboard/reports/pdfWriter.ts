/**
 * A small PDF writer for the report: A4 pages of text, lines and rectangles in the two standard
 * Helvetica fonts, so the file needs no embedded fonts and no PDF library. It is deterministic
 * (same input, same bytes) which is what lets the report have a fixed file name and be tested.
 *
 * Text is limited to what the standard fonts hold (WinAnsi: Western European letters, £, €,
 * typographic quotes and dashes); any other character is written as "?" rather than dropped silently.
 * Coordinates here start at the top-left of the page, in points (1/72 inch).
 */

export const A4_LANDSCAPE = { width: 841.89, height: 595.28 } as const;

/** Helvetica advance widths for ASCII 32 to 126, in 1/1000 em. Bold is measured wider by BOLD_FACTOR. */
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD_FACTOR = 1.07;

const WIN_ANSI: Record<string, number> = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };

/** The byte a character is written as, or "?" when the standard fonts have no glyph for it. */
function winAnsi(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return code;
  if (code >= 160 && code <= 255) return code;
  return WIN_ANSI[char] ?? 63;
}
const toBytes = (text: string) => Array.from(text.replace(/[\r\n\t]+/g, " ")).map(winAnsi);

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const byte of toBytes(text)) units += byte >= 32 && byte <= 126 ? HELVETICA[byte - 32] : 556;
  return (units / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Lines no wider than `max`; a word wider than the line is broken by characters, so nothing is clipped. */
export function wrapText(text: string, max: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    const push = () => { if (line) out.push(line); line = ""; };
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (textWidth(rest, size, bold) > max) {
        push();
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > max) cut--;
        // Prefer to break after a hyphen ("Driver-" / "reported") over cutting a word in two.
        const hyphen = rest.lastIndexOf("-", cut - 1);
        if (hyphen > 0) cut = hyphen + 1;
        out.push(rest.slice(0, cut)); rest = rest.slice(cut);
      }
      const trial = line ? `${line} ${rest}` : rest;
      if (line && textWidth(trial, size, bold) > max) { push(); line = rest; } else line = trial;
    }
    push();
  }
  return out.length ? out : [""];
}

export type Rgb = readonly [number, number, number];
const rgb = ([r, g, b]: Rgb) => [r, g, b].map(value => (value / 255).toFixed(3)).join(" ");
const num = (value: number) => (Math.round(value * 100) / 100).toString();
const escapeText = (bytes: number[]) => bytes.map(byte => byte === 40 || byte === 41 || byte === 92 ? `\\${String.fromCharCode(byte)}` : byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, "0")}`).join("");

export class PdfDocument {
  readonly width: number;
  readonly height: number;
  private pages: string[][] = [];
  constructor(size: { width: number; height: number } = A4_LANDSCAPE) { this.width = size.width; this.height = size.height; }

  get pageCount() { return this.pages.length; }
  addPage() { this.pages.push([]); return this.pages.length - 1; }
  private ops(page: number) { return this.pages[page]; }

  text(page: number, x: number, top: number, value: string, options: { size?: number; bold?: boolean; color?: Rgb; align?: "left" | "right" } = {}) {
    const size = options.size ?? 9, bold = options.bold ?? false;
    const left = options.align === "right" ? x - textWidth(value, size, bold) : x;
    this.ops(page).push(`BT ${rgb(options.color ?? [29, 35, 41])} rg /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(left)} ${num(this.height - top)} Td (${escapeText(toBytes(value))}) Tj ET`);
  }
  line(page: number, x1: number, top1: number, x2: number, top2: number, options: { width?: number; color?: Rgb } = {}) {
    this.ops(page).push(`${rgb(options.color ?? [214, 221, 227])} RG ${num(options.width ?? 0.5)} w ${num(x1)} ${num(this.height - top1)} m ${num(x2)} ${num(this.height - top2)} l S`);
  }
  rect(page: number, x: number, top: number, w: number, h: number, options: { fill?: Rgb; stroke?: Rgb } = {}) {
    const paint = options.fill && options.stroke ? "B" : options.fill ? "f" : "S";
    this.ops(page).push(`${options.fill ? `${rgb(options.fill)} rg ` : ""}${options.stroke ? `${rgb(options.stroke)} RG 0.5 w ` : ""}${num(x)} ${num(this.height - top - h)} ${num(w)} ${num(h)} re ${paint}`);
  }

  build(info: { title: string; author: string; subject?: string; created: Date }): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => { objects.push(body); return objects.length; };
    const pagesId = 2;
    add("<< /Type /Catalog /Pages 2 0 R >>");                       // 1
    add("");                                                       // 2, filled below
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");        // 3
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");   // 4
    const stamp = `D:${info.created.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
    const text = (value: string) => `(${escapeText(toBytes(value))})`;
    add(`<< /Title ${text(info.title)} /Author ${text(info.author)} /Creator ${text("The Man Van dashboard")} ${info.subject ? `/Subject ${text(info.subject)} ` : ""}/CreationDate (${stamp}) >>`); // 5
    const kids: number[] = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const contentId = objects.length + 2;
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`));
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(id => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

    let out = "%PDF-1.4\n%âãÏÓ\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => { offsets.push(out.length); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Every character is below 256 (content is WinAnsi bytes written as escapes), so one char is one byte.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
