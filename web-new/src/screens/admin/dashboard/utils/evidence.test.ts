import { describe, it, expect } from "vitest";
import { evidencePhotoCount } from "./evidence";

describe("evidencePhotoCount", () => {
  it("returns the length of a present photos array", () => {
    expect(evidencePhotoCount({ photos: [{ fileId: "a" }, { fileId: "b" }, { fileId: "c" }] })).toBe(3);
  });

  it("treats a present-but-empty array as a truthful zero", () => {
    expect(evidencePhotoCount({ photos: [] })).toBe(0);
  });

  it("returns null when the record carries no photos field", () => {
    expect(evidencePhotoCount({})).toBeNull();
    expect(evidencePhotoCount({ clientName: "Jo" })).toBeNull();
  });

  it("returns null when photos is present but not an array", () => {
    expect(evidencePhotoCount({ photos: "3" })).toBeNull();
    expect(evidencePhotoCount({ photos: 3 })).toBeNull();
    expect(evidencePhotoCount({ photos: null })).toBeNull();
  });

  it("falls back to a nested rawRecord.photos array", () => {
    expect(evidencePhotoCount({ rawRecord: { photos: [{ fileId: "x" }] } })).toBe(1);
    expect(evidencePhotoCount({ rawRecord: { photos: [] } })).toBe(0);
  });

  it("returns null for non-object input", () => {
    expect(evidencePhotoCount(null)).toBeNull();
    expect(evidencePhotoCount(undefined)).toBeNull();
    expect(evidencePhotoCount("submission")).toBeNull();
    expect(evidencePhotoCount(7)).toBeNull();
  });

  it("prefers a top-level photos array over rawRecord", () => {
    expect(evidencePhotoCount({ photos: [{ fileId: "a" }, { fileId: "b" }], rawRecord: { photos: [] } })).toBe(2);
  });
});
