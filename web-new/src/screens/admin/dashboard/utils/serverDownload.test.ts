import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadServerCsv } from "./serverDownload";

afterEach(() => vi.restoreAllMocks());

describe("downloadServerCsv", () => {
  it("downloads through fetch with the server's safe file name", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response("a,b", { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="tmv-jobs-1.csv"' } }));
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("tmv-jobs-1.csv"); });
    await downloadServerCsv("/api/admin/jobs/export.csv", "fallback.csv");
    expect(click).toHaveBeenCalled();
  });
  it("reports a failure instead of navigating away", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "Not allowed" } }), { status: 403, headers: { "Content-Type": "application/json" } }));
    await expect(downloadServerCsv("/api/admin/jobs/export.csv", "x.csv")).rejects.toThrow("Not allowed");
  });
  it("rejects an unexpected file type and unsafe names fall back", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(downloadServerCsv("/api/admin/jobs/export.csv", "x.csv")).rejects.toThrow("expected file");
  });
});
