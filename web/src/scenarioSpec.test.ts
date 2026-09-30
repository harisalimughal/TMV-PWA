import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./scenarioSpec";

describe("scenario photo limits", () => {
  it("caps every scenario evidence set at 30 photos", () => {
    expect(SCENARIOS.checkin.photoMax).toBe(30);
    expect(SCENARIOS.checkout.photoMax).toBe(30);
    expect(SCENARIOS.parking.photoMax).toBe(30);
    expect(SCENARIOS.liability.photoMax).toBe(30);
  });
});
