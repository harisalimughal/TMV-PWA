import { describe, expect, it } from "vitest";
import { safeInternalUrl } from "./safeUrl";

const ORIGIN = "https://chat.themanvan.co.uk";
const CASES: Array<[unknown, string]> = [
  ["/?tab=jobs", "/?tab=jobs"],
  ["/?tab=activity&job=TMV-1", "/?tab=activity&job=TMV-1"],
  ["https://chat.themanvan.co.uk/?tab=van", "/?tab=van"],
  ["", "/"], [undefined, "/"], [42, "/"], ["   ", "/"],
  ["https://evil.example/phish", "/"],
  ["//evil.example/phish", "/"],
  ["/\\evil.example", "/"],
  ["javascript:alert(1)", "/"],
  ["data:text/html,<script>1</script>", "/"],
  ["http://chat.themanvan.co.uk/", "/"] // same host, different scheme is a different origin
];

describe("safeInternalUrl", () => {
  it.each(CASES)("%j -> %j", (raw, expected) => expect(safeInternalUrl(raw, ORIGIN)).toBe(expected));
});

describe("relative links", () => {
  it("resolve from the current page, so a bare #section stays on that page", () => {
    expect(safeInternalUrl("#legacy", ORIGIN, `${ORIGIN}/driver?x=1`)).toBe("/driver?x=1#legacy");
  });
});

describe("push worker copy", () => {
  // The service worker cannot import app code, so it carries a copy. Run that copy against the same cases.
  const files = import.meta.glob("../../public/push-worker.js", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const source = Object.values(files)[0];
  const body = source.slice(source.indexOf("// SAFE-URL-BEGIN"), source.indexOf("// SAFE-URL-END"));
  const workerFn = new Function(`${body}; return safeInternalUrl;`)() as (raw: unknown, origin: string) => string;
  it.each(CASES)("%j -> %j", (raw, expected) => expect(workerFn(raw, ORIGIN)).toBe(expected));
  it("uses the safe url for navigation and keeps the raw url only to mark the log entry read", () => {
    expect(source).toMatch(/var targetUrl = safeInternalUrl\(rawUrl, self\.location\.origin\)/);
    expect(source).toMatch(/notifMarkRead\(rawUrl\)/);
    expect(source).toMatch(/client\.navigate\(targetUrl\)/);
    expect(source).toMatch(/clients\.openWindow\(targetUrl\)/);
  });
});
