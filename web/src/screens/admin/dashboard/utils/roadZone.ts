import type { ReportRoadAlert } from "../driverReport.types";

/** Readable zone name from GPSLive alert-rule names ("CHARGES - ALERTS (Congestion Zone SW)" -> "Congestion Zone SW"). */
export function roadZoneLabel(row: ReportRoadAlert) {
  const names = row.zone.split(",").map(name => name.replace(/\bcharges?\s*(?:[-\x3a|/&]|\band\b)?\s*alerts?\b/gi, "")
    .replace(/\b(?:charges?|alerts?)\b/gi, "").replace(/\s*[-\x3a|/]\s*(?=[-\x3a|/]|$)/g, "").replace(/^\s*[-\x3a|/]\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return [...new Set(names)].join(", ") || (row.scheme === "congestion" ? "Congestion Zone" : row.scheme === "dartford" ? "Dartford Crossing" : "Blackwall / Silvertown Tunnels");
}
