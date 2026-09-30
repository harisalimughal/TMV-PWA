import { describe, expect, it } from "vitest";
import { scenarioPointFromRecord } from "./scenarioPoint";

describe("scenarioPointFromRecord", () => {
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
