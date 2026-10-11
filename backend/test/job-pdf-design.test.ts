import { describe, expect, it } from "vitest";
import { generateJobPdf } from "../src/admin/dashboard/pdf-generator";
import type { NormalizedJob } from "../src/admin/dashboard/types";
import { paperJobSample } from "../../web/test/reportPreview.sample";
describe("Company job summary PDF", () => {
  it("produces a paginated PDF without mutating the source or falsely labelling it immutable", async () => {
    const job = { ...paperJobSample, reviewEmailStatus: "No" } as unknown as NormalizedJob;
    const before = JSON.stringify(job);
    const buffer = await generateJobPdf(job);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1")).not.toContain("Official Immutable Record");
    expect(JSON.stringify(job)).toBe(before);
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.toString("latin1").match(/\/Type \/Page\b/g)!).toHaveLength(2);
  });
  it("retains a long multi-page customer field rather than clipping a fixed page", async () => {
    const buffer = await generateJobPdf({ ...paperJobSample, customerName: "Long customer name ".repeat(500) + "FINAL CUSTOMER MARKER" } as unknown as NormalizedJob);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(2);
  });
});
