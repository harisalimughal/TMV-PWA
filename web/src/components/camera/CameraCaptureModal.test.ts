import { describe, expect, it } from "vitest";
import { canUseLocationForCapture, locationForCapture } from "./CameraCaptureModal";
import type { CapturedLocation } from "../../lib/geo";

const current: CapturedLocation = { lat: 51.5, lng: -0.12, accuracy: 5 };
const stepFallback: CapturedLocation = { lat: 51.6, lng: -0.13, accuracy: 9 };

describe("camera capture location requirement", () => {
  it("requires a current location for the first photo in a step", () => {
    expect(canUseLocationForCapture(null, null, true)).toBe(false);
    expect(locationForCapture(null, null, true)).toBeNull();
  });

  it("allows another photo in the same step to reuse the step location", () => {
    expect(canUseLocationForCapture(null, stepFallback, true)).toBe(true);
    expect(locationForCapture(null, stepFallback, true)).toEqual(stepFallback);
  });

  it("prefers the latest current GPS fix over the step fallback", () => {
    expect(canUseLocationForCapture(current, stepFallback, true)).toBe(true);
    expect(locationForCapture(current, stepFallback, true)).toEqual(current);
  });

  it("keeps non-evidence camera use best-effort when location is not required", () => {
    expect(canUseLocationForCapture(null, null, false)).toBe(true);
    expect(locationForCapture(null, null, false)).toBeNull();
  });
});
