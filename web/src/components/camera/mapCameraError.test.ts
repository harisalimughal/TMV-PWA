import { describe, expect, it } from "vitest";
import { mapCameraError } from "./mapCameraError";

function domError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

describe("mapCameraError", () => {
  it("maps a denied permission to a 'camera access is required' message", () => {
    for (const name of ["NotAllowedError", "PermissionDeniedError", "SecurityError"]) {
      const info = mapCameraError(domError(name));
      expect(info.status).toBe("denied");
      expect(info.message).toMatch(/camera access is required/i);
      expect(info.hint).toBeTruthy();
    }
  });

  it("maps a missing device to 'no camera'", () => {
    for (const name of ["NotFoundError", "OverconstrainedError", "DevicesNotFoundError"]) {
      expect(mapCameraError(domError(name)).status).toBe("notfound");
    }
  });

  it("maps a busy device to 'in use'", () => {
    for (const name of ["NotReadableError", "TrackStartError", "AbortError"]) {
      expect(mapCameraError(domError(name)).status).toBe("inuse");
    }
  });

  it("maps a TypeError (no getUserMedia) to 'unsupported'", () => {
    expect(mapCameraError(domError("TypeError")).status).toBe("unsupported");
  });

  it("falls back to a generic 'error' for anything else", () => {
    expect(mapCameraError(domError("WeirdError")).status).toBe("error");
    expect(mapCameraError("a string").status).toBe("error");
    expect(mapCameraError(undefined).status).toBe("error");
  });

  it("never suggests uploading or choosing an existing photo", () => {
    const names = [
      "NotAllowedError",
      "NotFoundError",
      "NotReadableError",
      "TypeError",
      "WeirdError",
    ];
    for (const name of names) {
      const info = mapCameraError(domError(name));
      const text = `${info.message} ${info.hint ?? ""}`.toLowerCase();
      expect(text).not.toMatch(
        /\bupload\b|\bgallery\b|photo library|choose (a|an|from|existing|another)|select (a|an|from|existing)|browse for|file picker|from your (photos|files)/,
      );
    }
  });
});
