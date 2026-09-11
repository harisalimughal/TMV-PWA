import { describe, expect, it } from "vitest";
import { formatCoords, formatLocationLabel } from "./geo";

const LOCATION = { lat: 51.5074, lng: -0.1278, accuracy: 12 };

describe("formatLocationLabel", () => {
  it("prefers the resolved place name when one's present", () => {
    expect(formatLocationLabel(LOCATION, "56 Bucklebury, Tower Hamlets")).toBe("56 Bucklebury, Tower Hamlets");
  });

  it("falls back to raw coordinates when there's no name yet", () => {
    expect(formatLocationLabel(LOCATION)).toBe(formatCoords(LOCATION));
    expect(formatLocationLabel(LOCATION, undefined)).toBe(formatCoords(LOCATION));
  });

  it("falls back to coordinates for a blank/whitespace-only name", () => {
    expect(formatLocationLabel(LOCATION, "   ")).toBe(formatCoords(LOCATION));
    expect(formatLocationLabel(LOCATION, "")).toBe(formatCoords(LOCATION));
  });
});
