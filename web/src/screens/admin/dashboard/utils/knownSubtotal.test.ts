import { describe, expect, it } from "vitest";
import { knownSubtotal } from "./knownSubtotal";
import { totalChargesForJob } from "./workBreakdown";
import type { NormalizedJob } from "../types";
describe("Known financial subtotals", () => {
  it("preserves verified zero", () => expect(knownSubtotal(0)).toBe("0.00"));
  it("does not show an unknown amount as zero", () => expect(knownSubtotal(0, 1)).toBe("Unknown"));
  it("labels a partial known subtotal", () => expect(knownSubtotal(18, 2)).toBe("18.00 + unknown"));
  it("preserves a confirmed zero customer price", () => expect(totalChargesForJob({ totalCharges: 0, calculatedTotalCharges: 25000 } as NormalizedJob)).toBe(0));
});
