import { describe, expect, it, vi } from "vitest";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";
import { lineString, point, polygon } from "@turf/helpers";
import { createSchemePosition } from "../src/gps/gps.geometry";
import type { GpsLiveZone } from "../src/integrations/gpslive";

vi.mock("@turf/point-to-line-distance", async original => {
  const actual = await original<typeof import("@turf/point-to-line-distance")>();
  return { ...actual, default: vi.fn(actual.default) };
});

const zone: GpsLiveZone = { zoneId: 10377, zoneName: "Congestion", zoneVertices: [[51.49, -0.15], [51.49, -0.10], [51.52, -0.10], [51.52, -0.15]] };
const reference = (location: { lat: number; lng: number }, source: GpsLiveZone, margin: number) => {
  const ring = source.zoneVertices.map(([lat, lng]) => [lng, lat]); ring.push([...ring[0]]);
  const p = point([location.lng, location.lat]);
  const distance = pointToLineDistance(p, lineString(ring), { units: "meters" });
  return booleanPointInPolygon(p, polygon([ring]), { ignoreBoundary: true }) && distance > margin ? "inside" : distance <= margin ? "boundary" : "outside";
};

describe("prepared GPS geometry", () => {
  it.each([0, 25, 100])("matches the previous exact Turf classification at margin %s", margin => {
    const classify = createSchemePosition([zone], margin);
    for (let y = 0; y <= 12; y++) for (let x = 0; x <= 12; x++) {
      const p = { lat: 51.4898 + y * 0.00255, lng: -0.1502 + x * 0.0042 };
      expect(classify(p, "congestion")).toBe(reference(p, zone, margin));
    }
    for (const [lat, lng] of zone.zoneVertices) {
      expect(classify({ lat, lng }, "congestion")).toBe(reference({ lat, lng }, zone, margin));
    }
  });

  it("matches exact geodesic distances for long and antimeridian edges", () => {
    const source: GpsLiveZone = { zoneId: 10377, zoneName: "Congestion", zoneVertices: [[60, 170], [60, -170], [70, -170], [70, 170]] };
    const classify = createSchemePosition([source]);
    for (const p of [{ lat: 60, lng: 175 }, { lat: 61, lng: 179.9 }, { lat: 70, lng: -179 }, { lat: 0, lng: 0 }]) expect(classify(p, "congestion")).toBe(reference(p, source, 25));
  });

  it("skips exact distance calculations for points that cannot be near any edge", () => {
    const classify = createSchemePosition([zone]);
    vi.mocked(pointToLineDistance).mockClear();
    for (let i = 0; i < 20_000; i++) expect(classify({ lat: 51.3, lng: 0.2 }, "congestion")).toBe("outside");
    expect(pointToLineDistance).not.toHaveBeenCalled();
    expect(classify({ lat: 51.49, lng: -0.125 }, "congestion")).toBe("boundary");
    expect(pointToLineDistance).toHaveBeenCalled();
  });

  it("retains missing/invalid geometry behavior", () => {
    expect(createSchemePosition([])({ lat: 51.5, lng: -0.12 }, "congestion")).toBe("unavailable");
    expect(createSchemePosition([{ ...zone, zoneVertices: [] }])({ lat: 51.5, lng: -0.12 }, "congestion")).toBe("unavailable");
  });
});
