import { describe, expect, it } from "vitest";
import { photoLocationBlockedReason } from "./photoLocation";

describe("photoLocationBlockedReason", () => {
  it("allows taking photos before GPS but blocks continuing until each new photo has location", () => {
    expect(photoLocationBlockedReason(1, [{ capturedAt: "2026-09-26T10:00:00Z", location: null }])).toBe(
      "Getting location. Please wait a moment before continuing."
    );
  });

  it("explains why location could not be captured when the browser reports it", () => {
    expect(
      photoLocationBlockedReason(1, [
        { capturedAt: "2026-09-26T10:00:00Z", location: null, locationError: "denied" }
      ])
    ).toBe(
      "Location is blocked. Open chat.themanvan.co.uk in your browser, allow Location for the site, then return to the app and try again."
    );
  });

  it("allows continuing once location has been backfilled", () => {
    expect(
      photoLocationBlockedReason(1, [
        { capturedAt: "2026-09-26T10:00:00Z", location: { lat: 51.5, lng: -0.12, accuracy: 12 } }
      ])
    ).toBeUndefined();
  });

  it("does not block before a photo exists", () => {
    expect(photoLocationBlockedReason(0, [])).toBeUndefined();
  });
});
