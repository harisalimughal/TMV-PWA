import { describe, expect, it } from "vitest";
import { findDeviceForDriver, isGpsLiveDeviceActive } from "../src/integrations/gpslive";

const device = (imei: string, name: string, plateNumber: string, active: string | boolean = "true") => ({
  imei, name, plateNumber, active, dtTracker: "2026-10-01 10:00:00",
  lat: 51.5, lng: -0.14, speed: 0
});

describe("findDeviceForDriver", () => {
  it("repairs an inactive assignment from one unique active initials match", () => {
    const driver = { initials: "AB", vanRegistration: "AB12 CDE", imei: "assigned-offline" };
    const devices = [
      device("assigned-offline", "AB12 - AB", "AB12 CDE", "false"),
      device("replacement", "AB12 CDE - AB", "AB12 CDE")
    ];
    expect(findDeviceForDriver(driver, devices)?.imei).toBe("replacement");
  });

  it("keeps an explicitly assigned active device", () => {
    const driver = { initials: "AB", vanRegistration: "AB12 CDE", imei: "assigned" };
    const devices = [
      device("assigned", "Pool van", "XY12 ZZZ"),
      device("other", "AB12 CDE - AB", "AB12 CDE")
    ];
    expect(findDeviceForDriver(driver, devices)?.imei).toBe("assigned");
  });

  it("does not guess when initials identify multiple active trackers", () => {
    const driver = { initials: "AB", vanRegistration: "AB12 CDE" };
    const devices = [
      device("one", "AB12 CDE - AB", "AB12 CDE"),
      device("two", "AB12 CDE - AB", "AB12 CDE")
    ];
    expect(findDeviceForDriver(driver, devices)).toBeNull();
  });

  it("normalizes GPSLive's string and boolean active flags", () => {
    expect(isGpsLiveDeviceActive(device("one", "One", "", "true"))).toBe(true);
    expect(isGpsLiveDeviceActive(device("two", "Two", "", "false"))).toBe(false);
    expect(isGpsLiveDeviceActive(device("three", "Three", "", false))).toBe(false);
  });
});
