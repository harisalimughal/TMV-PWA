import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";
import { earthRadius, lineString, point, polygon } from "@turf/helpers";
import type { GpsLiveZone } from "../integrations/gpslive";
import { gpsLocation, gpsScheme } from "./gps.parse";
import type { GpsScheme } from "./gps.types";

type Vector = [number, number, number];
const vector = (lat: number, lng: number): Vector => {
  const a = lat * Math.PI / 180, b = lng * Math.PI / 180;
  return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
};
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Compile once per history read; exact Turf distances are only needed near an edge. */
export function createSchemePosition(zones: GpsLiveZone[], margin = 25) {
  const prepared = zones.map(zone => {
    const scheme = gpsScheme(zone.zoneName, zone.zoneId);
    try {
      if (!Array.isArray(zone.zoneVertices) || zone.zoneVertices.length < 3 || zone.zoneVertices.some(pair => !Array.isArray(pair) || !gpsLocation(pair[0], pair[1]))) return { scheme, geometry: null };
      const ring = zone.zoneVertices.map(([lat, lng]) => [lng, lat]);
      if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push([...ring[0]]);
      const segments = ring.slice(1).map((end, i) => {
        const start = ring[i], a = vector(start[1], start[0]), b = vector(end[1], end[0]);
        const length = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
        // Triangle inequality: an edge cannot approach within margin if either
        // endpoint is farther than edge length + margin. The epsilon is conservative.
        const threshold = Math.cos(Math.min(Math.PI, length + Math.max(0, margin) / earthRadius)) - 1e-12;
        return { a, b, threshold, line: lineString([start, end]) };
      });
      return { scheme, geometry: { area: polygon([ring]), segments } };
    } catch { return { scheme, geometry: null }; }
  });
  return (location: { lat: number; lng: number }, scheme: GpsScheme): "inside" | "outside" | "boundary" | "unavailable" => {
    const relevant = prepared.filter(zone => zone.scheme === scheme);
    if (!relevant.length) return "unavailable";
    let boundary = false;
    const at = vector(location.lat, location.lng);
    for (const zone of relevant) {
      if (!zone.geometry) return "unavailable";
      try {
        const p = point([location.lng, location.lat]);
        const near = zone.geometry.segments.some(segment => {
          if (dot(at, segment.a) < segment.threshold || dot(at, segment.b) < segment.threshold) return false;
          return pointToLineDistance(p, segment.line, { units: "meters" }) <= margin;
        });
        if (booleanPointInPolygon(p, zone.geometry.area, { ignoreBoundary: true }) && !near) return "inside";
        if (near) boundary = true;
      } catch { return "unavailable"; }
    }
    return boundary ? "boundary" : "outside";
  };
}

export function schemePosition(location: { lat: number; lng: number }, scheme: GpsScheme, zones: GpsLiveZone[], margin = 25) {
  return createSchemePosition(zones, margin)(location, scheme);
}
