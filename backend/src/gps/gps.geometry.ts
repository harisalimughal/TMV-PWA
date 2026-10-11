import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";
import { lineString, point, polygon } from "@turf/helpers";
import type { GpsLiveZone } from "../integrations/gpslive";
import { gpsLocation, gpsScheme } from "./gps.parse";
import type { GpsScheme } from "./gps.types";

export function schemePosition(location: { lat: number; lng: number }, scheme: GpsScheme, zones: GpsLiveZone[], margin = 25): "inside" | "outside" | "boundary" | "unavailable" {
  const relevant = zones.filter(zone => gpsScheme(zone.zoneName, zone.zoneId) === scheme);
  if (!relevant.length) return "unavailable";
  let boundary = false;
  for (const zone of relevant) {
    if (!Array.isArray(zone.zoneVertices) || zone.zoneVertices.length < 3 || zone.zoneVertices.some(pair => !Array.isArray(pair) || !gpsLocation(pair[0], pair[1]))) return "unavailable";
    const ring = zone.zoneVertices.map(([lat, lng]) => [lng, lat]);
    if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push([...ring[0]]);
    try {
      const p = point([location.lng, location.lat]);
      const distance = pointToLineDistance(p, lineString(ring), { units: "meters" });
      const inside = booleanPointInPolygon(p, polygon([ring]), { ignoreBoundary: true });
      if (inside && distance > margin) return "inside";
      if (distance <= margin) boundary = true;
    } catch { return "unavailable"; }
  }
  return boundary ? "boundary" : "outside";
}
