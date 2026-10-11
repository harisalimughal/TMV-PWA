import { describe, expect, it } from "vitest";
import { withArrivalDistance } from "./trackerArrival";

describe("Tracker arrival distance labels", () => {
  it("always includes the recorded metres in brackets, including zero", () => {
    expect(withArrivalDistance("09:00", 405)).toBe("09:00 (405 m)");
    expect(withArrivalDistance("09:00", 500)).toBe("09:00 (500 m)");
    expect(withArrivalDistance("09:00", 0)).toBe("09:00 (0 m)");
  });
  it.each([undefined, null, NaN, -1, "405"])("does not invent a distance from %s", distance => {
    expect(withArrivalDistance("09:00", distance)).toBe("09:00 (distance not recorded)");
  });
});
