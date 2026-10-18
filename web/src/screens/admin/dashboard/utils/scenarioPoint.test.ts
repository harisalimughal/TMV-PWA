import { describe, expect, it } from "vitest";
import { scenarioAddressFromRecord, scenarioPointFromRecord } from "./scenarioPoint";

describe("scenarioPointFromRecord", () => {
  it("uses saved reported-at addresses when no separate address was captured", () => {
    expect(scenarioAddressFromRecord({ address: "", rawRecord: { reported_at: "Pickup — 10 High Street" } })).toBe("10 High Street");
    expect(scenarioAddressFromRecord({ fields: { "Reported At": "Drop-off - 5 Low Street" } })).toBe("5 Low Street");
    expect(scenarioAddressFromRecord({ reportedAt: "Stop-by — Unit 2 — Storage Yard" })).toBe("Unit 2 — Storage Yard");
    expect(scenarioAddressFromRecord({ address: "Original address", reportedAt: "Pickup — Other location" })).toBe("Original address");
    expect(scenarioAddressFromRecord({ rawRecord: { address: "Legacy address" } })).toBe("Legacy address");
    expect(scenarioAddressFromRecord({ reportedAt: "Pickup" })).toBe("");
    expect(scenarioAddressFromRecord({})).toBe("");
  });
  it("returns the checkpoint tag and full reported-at text from raw records", () => {
    expect(scenarioPointFromRecord({ fields: { reported_at: "Pickup — 10 High Street" } })).toEqual({
      point: "Pickup",
      full: "Pickup — 10 High Street"
    });
    expect(scenarioPointFromRecord({ rawRecord: { "Reported At": "Stop-by — Storage Unit" } })).toEqual({
      point: "Stop-by",
      full: "Stop-by — Storage Unit"
    });
  });

  it("uses normalized finished-job scenario fields when present", () => {
    expect(scenarioPointFromRecord({ reportedAt: "Drop-off — 5 Low Street", reportedAtPoint: "Drop-off" })).toEqual({
      point: "Drop-off",
      full: "Drop-off — 5 Low Street"
    });
  });
});
