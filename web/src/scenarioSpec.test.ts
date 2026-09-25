import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./scenarioSpec";

describe("scenario photo limits", () => {
  it("caps storage check-in and check-out evidence at 30 photos", () => {
    expect(SCENARIOS.checkin.photoMax).toBe(30);
    expect(SCENARIOS.checkout.photoMax).toBe(30);
  });
});
