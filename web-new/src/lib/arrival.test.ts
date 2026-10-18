import { describe, expect, it } from "vitest";
import { isWithinArrivalRadius } from "./arrival";

describe("isWithinArrivalRadius", () => {
  it("detects when the driver is close enough to the pickup point", () => {
    expect(
      isWithinArrivalRadius(
        { lat: 51.5394, lng: -0.1027, accuracy: 25 },
        { lat: 51.5398, lng: -0.1021 }
      )
    ).toBe(true);
  });

  it("does not detect arrival when the driver is outside the radius", () => {
    expect(
      isWithinArrivalRadius(
        { lat: 51.5394, lng: -0.1027, accuracy: 25 },
        { lat: 51.552, lng: -0.121 }
      )
    ).toBe(false);
  });

  it("does not detect arrival without pickup coordinates", () => {
    expect(isWithinArrivalRadius({ lat: 51.5394, lng: -0.1027, accuracy: 25 }, undefined)).toBe(false);
  });
});
