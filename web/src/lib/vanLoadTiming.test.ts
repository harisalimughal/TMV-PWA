import { describe, expect, it } from "vitest";
import { getVanLoadTiming, VAN_LOAD_OVERDUE_MINUTES } from "./vanLoadTiming";

describe("getVanLoadTiming", () => {
  it("flags a missing van loaded photo once pickup arrival is more than 15 minutes old", () => {
    const timing = getVanLoadTiming(
      [
        {
          evidenceId: "arrival-1",
          evidenceType: "Arrival",
          url: "/arrival.jpg",
          capturedAt: "2026-09-25T09:00:00.000Z"
        }
      ],
      new Date("2026-09-25T09:16:00.000Z")
    );

    expect(VAN_LOAD_OVERDUE_MINUTES).toBe(15);
    expect(timing.pickupArrivalAt).toBe("2026-09-25T09:00:00.000Z");
    expect(timing.vanLoadedAt).toBeUndefined();
    expect(timing.delayMinutes).toBe(16);
    expect(timing.overdue).toBe(true);
    expect(timing.late).toBe(false);
  });

  it("does not use actualStart fallback when arrival evidence is required", () => {
    const timing = getVanLoadTiming(
      [],
      new Date("2026-09-25T09:30:00.000Z"),
      "2026-09-25T09:00:00.000Z",
      { requireArrivalEvidence: true }
    );

    expect(timing.pickupArrivalAt).toBeUndefined();
    expect(timing.overdue).toBe(false);
  });

  it("flags a completed van loaded photo when it was taken more than 15 minutes after pickup arrival", () => {
    const timing = getVanLoadTiming(
      [
        {
          evidenceId: "arrival-1",
          evidenceType: "Arrival",
          url: "/arrival.jpg",
          capturedAt: "2026-09-25T09:00:00.000Z"
        },
        {
          evidenceId: "loaded-1",
          evidenceType: "VanLoaded",
          url: "/loaded.jpg",
          capturedAt: "2026-09-25T09:18:00.000Z"
        }
      ],
      new Date("2026-09-25T09:20:00.000Z")
    );

    expect(timing.vanLoadedAt).toBe("2026-09-25T09:18:00.000Z");
    expect(timing.delayMinutes).toBe(18);
    expect(timing.late).toBe(true);
    expect(timing.overdue).toBe(false);
  });
});
