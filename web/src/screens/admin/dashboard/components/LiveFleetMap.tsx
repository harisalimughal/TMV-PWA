/* Leaflet's stylesheet is imported here rather than in the app-wide index.css so it
   ships inside the lazily loaded admin chunk. It was previously global, meaning 45kB
   of map CSS was downloaded by every driver for a map only this page renders. */
import "leaflet/dist/leaflet.css";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  WifiOff,
  PanelLeftClose,
  PanelLeftOpen,
  Search
} from "lucide-react";
import { NormalizedJob } from "../types";
import { fetchCongestionZones, fetchLiveFleet } from "../api";
import { TRACKER_STALE_AFTER_MINUTES, motionLabel, parseTrackerTime, signalFreshness } from "../utils/freshness";
import { formatAge, formatDateTime } from "../utils/format";

interface Props {
  jobs: NormalizedJob[];
  /** Opens the exact job (the canonical job detail), not just the Jobs list. */
  onSelectJob?: (jobId: string) => void;
  /** Vehicle to select on load (e.g. from an alert's "View on map"). */
  initialVehicle?: string | null;
  onSelectVehicle?: (imei: string | null) => void;
}

interface FleetVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  driverInitials: string;
  driverName: string;
  matched: boolean;
  lat: number;
  lng: number;
  speedMph: number;
  lastUpdate: string;
  isStale: boolean;
  isMoving: boolean;
  currentJob: NormalizedJob | null;
  odometerMiles: number | null;
  ignitionOn: boolean | null;
  batteryVoltage: number | null;
  gpsSignalLevel: number | null;
  gsmSignalLevel: number | null;
  jammingDetected: boolean;
}

type FilterId = "ALL" | "MOVING" | "STOPPED" | "STALE";

/** A never-blank short label for a van: the matched driver's initials, otherwise the
 *  first two alphanumerics of its plate / device name. Keeps "??" off every surface. */
function shortBadge(v: { matched: boolean; driverInitials: string; plateNumber: string; name: string }): string {
  if (v.matched && v.driverInitials) return v.driverInitials;
  const src = (v.plateNumber || v.name || "").replace(/[^A-Za-z0-9]/g, "");
  return src.slice(0, 2).toUpperCase() || "—";
}

/** Signal freshness and motion are separate facts (utils/freshness.ts). A position
 *  older than the stale threshold is only the *last known* position: the pin greys
 *  and the label says "Last known: stopped/moving" instead of claiming a current state. */
function relativeTime(dtTracker: string): string {
  return formatAge(dtTracker);
}

/** Approximate "stopped for" -- how long since the last position report (we don't get
 *  a true last-moved timestamp from GPSLive's device list, so this is the closest
 *  honest figure). */
function stoppedFor(dtTracker: string): string {
  const dt = DateTime.fromSQL(dtTracker, { zone: "utc" });
  if (!dt.isValid) return "—";
  const mins = Math.max(0, Math.round(DateTime.utc().diff(dt, "minutes").minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Bearing in degrees (0 = north) between two lat/lng points. Used to point the arrow
 *  marker the way a moving van is travelling (GPSLive's device list carries no
 *  heading field, so it's derived from consecutive fixes). */
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const STATE_COLOR = {
  moving: "#16A34A",
  stopped: "#B3760F",
  stale: "#9CA3AF",
  selected: "#1B75BC"
} as const;

function vehState(v: FleetVehicle): keyof typeof STATE_COLOR {
  if (v.isStale) return "stale";
  if (v.isMoving) return "moving";
  return "stopped";
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function LiveFleetMap({ jobs, onSelectJob, initialVehicle = null, onSelectVehicle }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const hasFitBoundsRef = useRef(false);
  const zonePolygonsRef = useRef<L.Polygon[]>([]);
  /** Last position + derived heading per device, so a moving van's arrow can point
   *  the right way between polls. */
  const trackRef = useRef<Record<string, { lat: number; lng: number; heading: number }>>({});
  /** Reverse-geocoded street address per device, filled lazily when a popup opens. */
  const addrRef = useRef<Record<string, string>>({});
  /** Which van's popup is open, so it survives the 10s marker rebuild. */
  const openPopupImeiRef = useRef<string | null>(null);
  const rebuildingRef = useRef(false);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Parent passes a fresh onSelectJob each render -- hold it in a ref so the popup
   *  builder and marker effect don't churn every poll. */
  const onSelectJobRef = useRef(onSelectJob);
  useEffect(() => {
    onSelectJobRef.current = onSelectJob;
  }, [onSelectJob]);

  const [selectedId, setSelectedIdState] = useState<string | null>(initialVehicle);
  const onSelectVehicleRef = useRef(onSelectVehicle);
  onSelectVehicleRef.current = onSelectVehicle;
  const setSelectedId = useCallback((imei: string | null) => { setSelectedIdState(imei); onSelectVehicleRef.current?.(imei); }, []);
  const [activeFilter, setActiveFilter] = useState<FilterId>("ALL");
  const [showCongestionZone, setShowCongestionZone] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // On a phone the vehicle list would cover the map, so it starts collapsed there; the toggle opens it.
  const [drawerOpen, setDrawerOpen] = useState(() => typeof window === "undefined" || !window.matchMedia || !window.matchMedia("(max-width: 639px)").matches);
  const [search, setSearch] = useState("");
  const collapseDrawer = () => setDrawerOpen(false);

  const { data: fleetData, isLoading: fleetLoading, isError: fleetError, error: fleetErrorValue, refetch: refetchFleet, dataUpdatedAt } = useQuery({
    queryKey: ["fleet_live"],
    queryFn: fetchLiveFleet,
    refetchInterval: 10000
  });

  const { data: zonesData, isFetched: zonesFetched } = useQuery({
    queryKey: ["congestion_zones"],
    queryFn: fetchCongestionZones,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000
  });

  const vehicles: FleetVehicle[] = useMemo(() => {
    return (fleetData?.vehicles || []).map(v => {
      const isStale = signalFreshness(v.lastUpdate) !== "current";
      const currentJob = v.driverInitials
        ? jobs.find(j => j.driverInitials === v.driverInitials && j.status === "IN_PROGRESS") || null
        : null;

      return {
        imei: v.imei,
        name: v.name,
        plateNumber: v.plateNumber,
        driverInitials: v.driverInitials || "",
        driverName: v.driverName || v.plateNumber || v.name || "Unidentified vehicle",
        matched: !!v.driverInitials,
        lat: v.lat,
        lng: v.lng,
        speedMph: v.speedMph,
        lastUpdate: v.lastUpdate,
        isStale,
        isMoving: !isStale && v.speedMph > 2,
        currentJob,
        odometerMiles: v.odometerMiles,
        ignitionOn: v.ignitionOn,
        batteryVoltage: v.batteryVoltage,
        gpsSignalLevel: v.gpsSignalLevel,
        gsmSignalLevel: v.gsmSignalLevel,
        jammingDetected: v.jammingDetected
      };
    });
  }, [fleetData, jobs]);

  // ---- 1. init map -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [51.5074, -0.1278],
      zoom: 11,
      // Leaflet's CSS zoom-end timer can run after this route has unmounted.
      // Keep map navigation responsive without scheduling that detached-pane callback.
      zoomAnimation: false,
      zoomControl: false,
      attributionControl: false
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, subdomains: "abc" }).addTo(map);
    mapInstanceRef.current = map;
    return () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      map.stop();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Recalculate size when the container resizes (fullscreen toggle, drawer, etc.).
  useEffect(() => {
    const id = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 250);
    return () => clearTimeout(id);
  }, [isFullscreen, drawerOpen]);

  // ---- 3. congestion zone polygons -----------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    zonePolygonsRef.current.forEach(p => map.removeLayer(p));
    zonePolygonsRef.current = [];
    if (!showCongestionZone) return;
    // The zone name sits in its own pane below the markers (Leaflet's tooltip pane is above them),
    // so it can never cover a vehicle's plate.
    if (!map.getPane("zoneLabels")) { const pane = map.createPane("zoneLabels"); pane.style.zIndex = "450"; pane.style.pointerEvents = "none"; }
    (zonesData?.zones || []).forEach(zone => {
      const polygon = L.polygon(zone.vertices, {
        color: "#DC2626",
        weight: 2,
        fillColor: "#DC2626",
        fillOpacity: 0.12
      }).addTo(map);
      // The zone name shows on hover and in the legend, not permanently: a permanent label sat in the middle of the zone, right on top of the vehicles inside it.
      polygon.bindTooltip(zone.zoneName, { sticky: true, direction: "top", className: "congestion-zone-label", pane: "zoneLabels" });
      zonePolygonsRef.current.push(polygon);
    });
  }, [zonesData, showCongestionZone]);

  // ---- filtering ----------------------------------------------------------
  const visibleVehicles = useMemo(() => {
    let list = vehicles;
    if (activeFilter === "MOVING") list = list.filter(v => v.isMoving);
    else if (activeFilter === "STOPPED") list = list.filter(v => !v.isStale && !v.isMoving);
    else if (activeFilter === "STALE") list = list.filter(v => v.isStale);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        v =>
          v.plateNumber.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q) ||
          v.driverName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [vehicles, activeFilter, search]);

  const movingCount = vehicles.filter(v => v.isMoving).length;
  const staleCount = vehicles.filter(v => v.isStale).length;
  const unlinkedCount = vehicles.filter(v => !v.matched).length;
  const stoppedCount = vehicles.length - movingCount - staleCount;

  // ---- popup HTML ---------------------------------------------------------
  const popupHtml = useCallback((v: FleetVehicle): string => {
    const color = STATE_COLOR[vehState(v)];
    const addr = addrRef.current[v.imei];
    const stateLabel = motionLabel(v.speedMph, v.isStale ? "stale" : "current");
    const g = (label: string, value: string) =>
      `<div class="vfm-cell"><span class="vfm-k">${esc(label)}</span><span class="vfm-v">${esc(value)}</span></div>`;

    const job = v.currentJob;
    const jobBlock = job
      ? `<div class="vfm-job">
           <div class="vfm-job-hd">Current job (matched by assigned driver) · ${esc(job.jobId)}</div>
           <div class="vfm-job-row"><b>A</b> ${esc(job.pickup || "—")}</div>
           <div class="vfm-job-row"><b>B</b> ${esc(job.dropoff || "—")}</div>
           <div class="vfm-job-cust">${esc(job.customerName || "")}</div>
           ${onSelectJobRef.current ? `<button class="vfm-btn" data-job="${esc(job.jobId)}">View job ${esc(job.jobId)}</button>` : ""}
         </div>`
      : "";

    const unlinked = !v.matched
      ? `<div class="vfm-warn">Not linked to a driver. On the <b>Drivers</b> page set a driver's van
           registration to <b>${esc(v.plateNumber || v.name)}</b> to connect them.</div>`
      : "";

    return `
      <div class="vfm-pop">
        <div class="vfm-pop-hd">
          <span class="vfm-dot" style="background:${color}"></span>
          <span class="vfm-title">${esc(v.plateNumber || v.name)}</span>
          ${v.matched ? `<span class="vfm-init">${esc(v.driverInitials)}</span>` : `<span class="vfm-unlinked">Unlinked</span>`}
        </div>
        <div class="vfm-fresh ${v.isStale ? "vfm-fresh-stale" : ""}">${v.isStale ? "Signal stale" : "Updated"} · ${esc(relativeTime(v.lastUpdate))}</div>
        <div class="vfm-addr">${addr ? esc(addr) : "Looking up address…"}</div>
        <a class="vfm-maps" href="https://www.google.com/maps?q=${v.lat},${v.lng}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        ${unlinked}
        <div class="vfm-grid">
          ${g("State", stateLabel)}
          ${g("Speed reported", v.isStale ? "Not current" : `${v.speedMph} mph`)}
          ${g("No update for", stoppedFor(v.lastUpdate))}
          ${g("Ignition", v.ignitionOn === null ? "—" : v.ignitionOn ? "On" : "Off")}
          ${g("Battery", v.batteryVoltage === null ? "—" : `${v.batteryVoltage}V`)}
          ${g("GPS / GSM", `${v.gpsSignalLevel ?? "—"} / ${v.gsmSignalLevel ?? "—"}`)}
          ${g("Mileage", v.odometerMiles === null ? "—" : `${v.odometerMiles.toLocaleString()} mi`)}
        </div>
        <div class="vfm-time">Position ${esc(formatDateTime(parseTrackerTime(v.lastUpdate)?.toISO() ?? null))} London · ${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} · Driver: ${esc(v.matched ? v.driverName : "No driver")}</div>
        ${jobBlock}
      </div>`;
  }, []);

  const refreshPopup = useCallback((v: FleetVehicle) => {
    const m = markersRef.current[v.imei];
    if (m?.isPopupOpen()) m.setPopupContent(popupHtml(v));
  }, [popupHtml]);

  /** Lazily reverse-geocode one van's position (Nominatim) and refresh its popup.
   *  Cached per device for the session; failures fall back to the coords line. */
  const geocode = useCallback(async (v: FleetVehicle) => {
    if (addrRef.current[v.imei]) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=0&lat=${v.lat}&lon=${v.lng}`,
        { headers: { "Accept-Language": "en-GB" } }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      addrRef.current[v.imei] = data.display_name || `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;
    } catch {
      addrRef.current[v.imei] = `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`;
    }
    refreshPopup(v);
  }, [refreshPopup]);

  // ---- 4. markers -------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    rebuildingRef.current = true;
    Object.values(markersRef.current).forEach(m => map.removeLayer(m));
    markersRef.current = {};

    visibleVehicles.forEach(veh => {
      const isSelected = selectedId === veh.imei;
      const state = vehState(veh);
      const color = isSelected ? STATE_COLOR.selected : STATE_COLOR[state];

      // Derive heading from movement between polls.
      const prev = trackRef.current[veh.imei];
      let heading = prev?.heading ?? 0;
      if (prev && veh.isMoving && (Math.abs(prev.lat - veh.lat) > 1e-5 || Math.abs(prev.lng - veh.lng) > 1e-5)) {
        heading = bearing(prev, veh);
      }
      trackRef.current[veh.imei] = { lat: veh.lat, lng: veh.lng, heading };

      const plate = veh.matched ? `${veh.plateNumber || veh.name} · ${veh.driverInitials}` : veh.plateNumber || veh.name;
      const showArrow = veh.isMoving;

      const icon = L.divIcon({
        className: "vfm-marker-wrap",
        html: `
          <div class="vfm-marker" style="opacity:${veh.isStale && !isSelected ? 0.75 : 1}">
            <div class="vfm-plate" style="background:${isSelected ? STATE_COLOR.selected : "rgba(16,24,40,0.9)"}">${esc(plate)}</div>
            <div class="vfm-glyph" style="${isSelected ? "filter:drop-shadow(0 0 6px rgba(27,117,188,.9));" : ""}${showArrow ? `transform:rotate(${heading}deg);` : ""}">
              ${
                showArrow
                  ? `<svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2 L20 20 L12 15.5 L4 20 Z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`
                  : `<svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="${color}" stroke="#fff" stroke-width="2.4"/></svg>`
              }
            </div>
          </div>`,
        iconSize: [150, 60],
        iconAnchor: [75, showArrow ? 36 : 45]
      });

      const marker = L.marker([veh.lat, veh.lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml(veh), { minWidth: 250, maxWidth: 300, className: "vfm-popup", autoPanPadding: [40, 40] });

      marker.on("click", () => setSelectedId(veh.imei));
      marker.on("popupopen", () => {
        openPopupImeiRef.current = veh.imei;
        void geocode(veh);
      });
      marker.on("popupclose", () => {
        if (!rebuildingRef.current) openPopupImeiRef.current = null;
      });
      markersRef.current[veh.imei] = marker;
    });

    // Re-open the popup that was open before this rebuild so a 10s refresh doesn't
    // dismiss the details the admin is reading.
    rebuildingRef.current = false;
    const keep = openPopupImeiRef.current;
    if (keep && markersRef.current[keep]) markersRef.current[keep].openPopup();

    // Fit once vehicles + the zone have both loaded, so central London (and the zone)
    // stay in frame even when the only live van is out in the suburbs.
    if (!hasFitBoundsRef.current && visibleVehicles.length > 0) {
      const pts: [number, number][] = visibleVehicles.map(v => [v.lat, v.lng] as [number, number]);
      const zoneVerts = showCongestionZone ? (zonesData?.zones || []).flatMap(z => z.vertices as [number, number][]) : [];
      zoneVerts.forEach(v => pts.push(v));
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 12 });
      if (!showCongestionZone || zoneVerts.length > 0 || zonesFetched) hasFitBoundsRef.current = true;
    }
  }, [visibleVehicles, selectedId, zonesData, showCongestionZone, zonesFetched, popupHtml, geocode]);

  // Wire the popup's "Inspect move" button (rendered as raw HTML) back to React.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handler = (e: L.PopupEvent) => {
      const el = (e.popup as L.Popup).getElement();
      el?.querySelector<HTMLButtonElement>("button[data-job]")?.addEventListener("click", ev => {
        const id = (ev.currentTarget as HTMLButtonElement).dataset.job;
        if (id) onSelectJobRef.current?.(id);
      });
    };
    map.on("popupopen", handler);
    return () => {
      map.off("popupopen", handler);
    };
  }, []);

  const focusVehicle = (v: FleetVehicle) => {
    setSelectedId(v.imei);
    const map = mapInstanceRef.current;
    if (!map) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 14), { animate: !reduceMotion, duration: 0.9 });
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => markersRef.current[v.imei]?.openPopup(), reduceMotion ? 50 : 950);
  };

  // A vehicle selected via the URL (e.g. an alert's "View on map") is focused once
  // its position has loaded.
  const focusedInitialRef = useRef(false);
  useEffect(() => {
    if (focusedInitialRef.current || !initialVehicle) return;
    const vehicle = vehicles.find(v => v.imei === initialVehicle);
    if (!vehicle || !mapInstanceRef.current) return;
    focusedInitialRef.current = true;
    focusVehicle(vehicle);
  }, [vehicles, initialVehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitAll = () => {
    const map = mapInstanceRef.current;
    if (!map || visibleVehicles.length === 0) return;
    const pts: [number, number][] = visibleVehicles.map(v => [v.lat, v.lng] as [number, number]);
    if (showCongestionZone) (zonesData?.zones || []).forEach(z => (z.vertices as [number, number][]).forEach(v => pts.push(v)));
    map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 13 });
  };

  return (
    <div
      className={`bg-white border border-admin-line rounded-2xl shadow-card overflow-hidden text-admin-ink transition-all ${
        isFullscreen ? "fixed inset-4 z-50 flex flex-col shadow-pop" : "relative"
      }`}
    >
      <style>{`
        .congestion-zone-label { background: rgba(16,24,40,.85); border: none; color: #fff;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 600; padding: 2px 6px; box-shadow: none; }
        .congestion-zone-label::before { display: none; }
        .vfm-marker-wrap { background: none !important; border: none !important; }
        .vfm-marker { position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
        .vfm-plate { margin-bottom: 4px; padding: 4px 11px; border-radius: 8px; color: #fff;
          font-family: 'IBM Plex Mono', monospace; font-size: 14.5px; font-weight: 700; letter-spacing: .02em;
          white-space: nowrap; box-shadow: 0 2px 8px rgba(16,24,40,.4); }
        .vfm-glyph { line-height: 0; transition: transform .4s ease; }
        .vfm-popup .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: var(--admin-shadow-lg); }
        .vfm-popup .leaflet-popup-content { margin: 0; width: 270px !important; }
        .vfm-pop { padding: 12px 13px; font-family: inherit; }
        .vfm-pop-hd { display: flex; align-items: center; gap: 7px; }
        .vfm-dot { width: 9px; height: 9px; border-radius: 999px; flex: none; }
        .vfm-title { font-weight: 800; font-size: 14px; color: rgb(var(--fg)); }
        .vfm-init { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 11px;
          background: rgb(var(--brand-subtle)); color: rgb(var(--brand)); padding: 1px 6px; border-radius: 5px; }
        .vfm-unlinked { margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; background: rgb(var(--surface-sunken)); color: rgb(var(--fg-subtle)); padding: 2px 6px; border-radius: 5px; }
        .vfm-fresh { margin-top: 6px; display: inline-block; font-size: 12px; font-weight: 700; color: rgb(var(--success-fg)); }
        .vfm-fresh-stale { color: rgb(var(--warning-fg)); }
        .vfm-addr { margin-top: 6px; font-size: 12px; line-height: 1.4; color: rgb(var(--fg-muted)); }
        .vfm-maps { display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 600; color: rgb(var(--brand)); }
        .vfm-warn { margin-top: 8px; padding: 7px 8px; border-radius: 7px; background: rgb(var(--warning-subtle)); border: 1px solid rgb(var(--warning-line));
          font-size: 10.5px; line-height: 1.45; color: rgb(var(--warning-fg)); }
        .vfm-grid { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .vfm-cell { background: rgb(var(--surface-sunken)); border: 1px solid rgb(var(--line)); border-radius: 7px; padding: 5px 7px; }
        .vfm-k { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--fg-subtle)); }
        .vfm-v { display: block; font-size: 12px; font-weight: 700; color: rgb(var(--fg)); margin-top: 1px; }
        .vfm-time { margin-top: 8px; font-size: 9.5px; color: rgb(var(--fg-subtle)); font-family: 'IBM Plex Mono', monospace; line-height: 1.5; }
        .vfm-job { margin-top: 9px; padding: 8px; background: rgb(var(--surface-sunken)); border: 1px solid rgb(var(--line)); border-radius: 8px; }
        .vfm-job-hd { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--fg-subtle)); }
        .vfm-job-row { margin-top: 4px; font-size: 11px; color: rgb(var(--fg-muted)); }
        .vfm-job-row b { display: inline-block; width: 14px; height: 14px; line-height: 14px; text-align: center;
          border-radius: 999px; background: rgb(var(--brand-subtle)); color: rgb(var(--brand)); font-size: 9px; margin-right: 5px; }
        .vfm-job-cust { margin-top: 5px; font-size: 11px; font-weight: 600; color: rgb(var(--fg)); }
        .vfm-btn { margin-top: 7px; width: 100%; height: 28px; border: none; border-radius: 6px; cursor: pointer;
          background: rgb(var(--brand-solid)); color: #fff; font-size: 11px; font-weight: 600; }
      `}</style>

      {/* toolbar */}
      <div className="p-3.5 border-b border-admin-line flex flex-wrap items-center gap-3 bg-white">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
          <span className="text-admin-ink-2" aria-live="polite">
            {fleetLoading ? "Loading positions…" : fleetError ? "Positions unavailable" : `${vehicles.length} tracked · ${movingCount} moving · ${staleCount} stale signal`}
          </span>
          {unlinkedCount > 0 && (
            <span className="rounded-full bg-admin-status-amber-bg border border-admin-status-amber/30 px-2 py-0.5 font-medium text-admin-status-amber">
              {unlinkedCount} not linked to a driver
            </span>
          )}
          {dataUpdatedAt > 0 && <span className="text-admin-ink-2">Refreshed {DateTime.fromMillis(dataUpdatedAt).setZone("Europe/London").toFormat("HH:mm:ss")}</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          <div className="tmv-segmented inline-flex max-w-full shrink-0 flex-wrap items-center gap-0.5 rounded-2xl border border-admin-line bg-admin-surface p-1">
            {(
              [
                { id: "ALL", label: `All (${vehicles.length})` },
                { id: "MOVING", label: `Moving (${movingCount})` },
                { id: "STOPPED", label: `Stopped (${stoppedCount})` },
                { id: "STALE", label: `Stale signal (${staleCount})` }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={activeFilter === tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition ${
                  activeFilter === tab.id ? "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)] ring-1 ring-admin-brand/25" : "text-admin-ink-2 hover:text-admin-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showCongestionZone}
            onClick={() => setShowCongestionZone(v => !v)}
            className={`inline-flex h-10 shrink-0 items-center rounded-xl border px-3 text-[13px] font-semibold transition ${
              showCongestionZone ? "bg-admin-brand-soft border-admin-brand/30 text-admin-brand" : "bg-surface border-admin-line text-admin-ink-2 hover:text-admin-ink"
            }`}
            title="Toggle London Congestion Charge zone"
          >
            Congestion zone overlay
          </button>

          <button
            onClick={() => setIsFullscreen(v => !v)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-admin-line bg-surface text-admin-ink-2 transition hover:bg-admin-surface hover:text-admin-ink"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen map" : "Fullscreen map"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* map */}
      <div className={`relative bg-admin-surface ${isFullscreen ? "flex-1 min-h-0" : "h-[560px]"}`}>
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* zoom controls */}
        <div className="absolute top-3 right-3 z-[500] flex flex-col gap-1 bg-white/95 backdrop-blur-xs p-1 rounded-xl border border-admin-line shadow-card">
          <button onClick={() => mapInstanceRef.current?.zoomIn()} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-admin-surface text-admin-ink transition" title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => mapInstanceRef.current?.zoomOut()} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-admin-surface text-admin-ink transition" title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={fitAll} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-admin-surface text-admin-ink transition" title="Fit all vehicles" aria-label="Fit all vehicles on the map">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* marker legend */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 max-w-[calc(100%-24px)] bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-admin-line shadow-card text-[12px] font-medium text-admin-ink-2">
          {(
            [
              ["Moving", STATE_COLOR.moving],
              ["Stopped", STATE_COLOR.stopped],
              [`Stale signal (over ${TRACKER_STALE_AFTER_MINUTES} min)`, STATE_COLOR.stale],
              ["Selected", STATE_COLOR.selected]
            ] as const
          ).map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-white shadow-[0_0_0_1px_rgba(16,24,40,0.15)]" style={{ background: color }} />
              {label}
            </span>
          ))}
          {showCongestionZone && (zonesData?.zones?.length ?? 0) > 0 && (
            <span className="flex basis-full items-center justify-center gap-1.5">
              <span aria-hidden className="h-2.5 w-3.5 rounded-sm border border-[#DC2626] bg-[#DC2626]/20" />
              {zonesData!.zones.map(zone => zone.zoneName).join(", ")}
            </span>
          )}
        </div>

        {/* collapsed: hamburger */}
        {!drawerOpen && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="absolute top-3 left-3 z-[500] flex items-center gap-2 px-3 h-10 rounded-lg bg-white shadow-card border border-admin-line text-admin-ink text-xs font-semibold hover:bg-admin-surface transition"
            title="Show vehicle list"
            aria-label="Show vehicle list"
          >
            <PanelLeftOpen className="w-4 h-4" />
            {vehicles.length} vans
          </button>
        )}

        {/* expanded: vehicle list drawer */}
        {drawerOpen && (
          <div className="absolute top-3 left-3 bottom-3 z-[500] w-[320px] max-w-[calc(100%-24px)] flex flex-col rounded-lg bg-white shadow-pop border border-admin-line overflow-hidden">
            <div className="relative flex items-center justify-between gap-2 px-3 h-11 border-b border-admin-line shrink-0">
              <span className="text-[13px] font-semibold text-admin-ink">Vehicles ({visibleVehicles.length})</span>
              <button
                type="button"
                onClick={collapseDrawer}
                className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-admin-surface text-admin-muted hover:text-admin-ink"
                title="Collapse list"
                aria-label="Collapse vehicle list"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2.5 py-2 border-b border-admin-line shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-admin-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  aria-label="Search vehicles by registration or driver"
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Registration or driver"
                  className="w-full h-10 pl-8 pr-2 rounded-xl bg-surface border border-admin-line text-[13px] text-admin-ink placeholder:text-admin-muted outline-none focus:border-admin-brand"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {visibleVehicles.length === 0 && (
                <p className="p-4 text-center text-[12px] text-admin-muted">No vehicles match.</p>
              )}
              {visibleVehicles.map(v => {
                const isSel = selectedId === v.imei;
                const color = STATE_COLOR[vehState(v)];
                const motion = motionLabel(v.speedMph, v.isStale ? "stale" : "current");
                return (
                  <div key={v.imei} className={`border-b border-admin-line/70 ${isSel ? "bg-admin-brand-soft" : "hover:bg-admin-surface"}`}>
                    <button
                      type="button"
                      onClick={() => focusVehicle(v)}
                      aria-pressed={isSel}
                      aria-label={`${v.matched ? v.driverName : "No driver"}, ${v.plateNumber || v.name}, ${motion}, updated ${relativeTime(v.lastUpdate)}`}
                      className="w-full text-left px-3 pt-2.5 pb-2"
                    >
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-admin-ink">{v.matched ? v.driverName : "No driver linked"}</span>
                        <span className="ml-auto shrink-0 font-mono text-[12.5px] font-semibold text-admin-ink-2">{v.plateNumber || v.name}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="text-admin-ink-2">{motion}{v.isMoving ? ` · ${v.speedMph} mph` : ""}</span>
                        <span className={`shrink-0 font-semibold ${v.isStale ? "text-admin-status-amber" : "text-admin-status-green"}`}>{v.isStale ? "Stale · " : "Updated "}{relativeTime(v.lastUpdate)}</span>
                      </div>
                      {addrRef.current[v.imei] && <div className="mt-0.5 truncate text-[12px] text-admin-ink-2">{addrRef.current[v.imei]}</div>}
                    </button>
                    {v.currentJob && onSelectJob && (
                      <button type="button" onClick={() => onSelectJob(v.currentJob!.jobId)} aria-label={`View current job ${v.currentJob.jobId} for ${v.driverName}`}
                        className="mx-3 mb-2 -mt-0.5 inline-flex max-w-[calc(100%-24px)] items-center gap-1 truncate rounded-md border border-admin-line bg-white px-2 py-1 text-[12px] font-semibold text-admin-brand hover:bg-admin-surface">
                        Current job: {v.currentJob.customerName || v.currentJob.jobId}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* loading / failed / empty are three different states, never an indefinite "waiting" */}
        {vehicles.length === 0 && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/80 backdrop-blur-xs" role={fleetError ? "alert" : "status"}>
            <div className="text-center px-6">
              <WifiOff className="w-8 h-8 text-admin-muted mx-auto mb-2 opacity-50" aria-hidden />
              <p className="text-[15px] font-semibold text-admin-ink">{fleetLoading ? "Loading vehicle positions…" : fleetError ? "Couldn't load vehicle positions" : "No vehicles are reporting"}</p>
              <p className="text-[13px] text-admin-ink-2 mt-1">{fleetError ? (fleetErrorValue as Error)?.message || "The tracker service did not respond." : fleetLoading ? "Contacting GPSLive." : "GPSLive returned no devices for this account."}</p>
              {fleetError && <button type="button" onClick={() => void refetchFleet()} className="mt-3 h-9 rounded-lg border border-admin-line bg-white px-3 text-[13px] font-semibold hover:bg-admin-surface">Try again</button>}
            </div>
          </div>
        )}
        {vehicles.length > 0 && fleetError && (
          <div role="status" className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-lg border border-admin-status-amber/30 bg-admin-status-amber-bg px-3 py-1.5 text-[12.5px] text-admin-status-amber shadow-sm">
            Latest refresh failed — showing positions from {DateTime.fromMillis(dataUpdatedAt).setZone("Europe/London").toFormat("HH:mm")}
          </div>
        )}
      </div>
    </div>
  );
}
