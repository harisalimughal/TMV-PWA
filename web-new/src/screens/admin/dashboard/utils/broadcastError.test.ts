import { describe, expect, it } from "vitest";
import { broadcastErrorMessage } from "./broadcastError";

describe("broadcastErrorMessage", () => {
  it("reads a string or an object error and falls back otherwise", () => {
    expect(broadcastErrorMessage({ error: "No subscribed devices" }, "Fallback")).toBe("No subscribed devices");
    expect(broadcastErrorMessage({ error: { code: "X", message: "Title too long" } }, "Fallback")).toBe("Title too long");
    expect(broadcastErrorMessage({ error: { code: "X" } }, "Fallback")).toBe("Fallback");
    expect(broadcastErrorMessage({}, "Fallback")).toBe("Fallback");
    expect(broadcastErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});
