import { describe, expect, it } from "vitest";
import { findDeviceForDriver } from "../src/integrations/gpslive";

describe("findDeviceForDriver", () => {
  it("does not substitute a plate match when an explicitly assigned IMEI is offline", () => {
    const driver = { initials: "AB", vanRegistration: "AB12 CDE", imei: "assigned-offline" };
    const devices = [{ imei: "other-van", name: "AB12 CDE - AB", plateNumber: "AB12 CDE", dtTracker: "2026-10-01 10:00:00", lat: 51.5, lng: -0.14, speed: 0 }];
    expect(findDeviceForDriver(driver, devices)).toBeNull();
  });
});
