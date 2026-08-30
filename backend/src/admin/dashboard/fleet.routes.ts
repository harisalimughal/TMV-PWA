/**
 * Adapted from TMV-Chat-bot's dashboard/server/routes/fleet.route.ts. Same GPSLive
 * integration and vehicle-shape, but driver-name matching now comes from tmv-pwa's own
 * driver_accounts (listDriverProfiles()) instead of the Sheets Drivers tab -- simpler
 * too, since DriverProfile fields are already typed instead of raw row strings.
 */
import { Request, Response, Router } from "express";
import { fetchGpsLiveDevices, GpsLiveDevice } from "../../integrations/gpslive";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { log } from "../../utils/logger";

export interface LiveFleetVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  lat: number;
  lng: number;
  speedMph: number;
  lastUpdate: string;
  driverInitials: string | null;
  driverName: string | null;
  odometerMiles: number | null;
  ignitionOn: boolean | null;
  batteryVoltage: number | null;
  gpsSignalLevel: number | null;
  gsmSignalLevel: number | null;
  jammingDetected: boolean;
  ecoDrivingEvent: string | null;
  ecoDrivingScore: number | null;
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** GPSLive plate numbers and our own Van Registration field are typed freely
 * ("WN69 FEH" vs "wn69feh") -- compare on letters/digits only. */
function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** GPSLive device names follow "<PLATE> - <DRIVER INITIALS>" for vans labelled that
 * way in the GPSLive dashboard -- not guaranteed for every device, only a fallback
 * when the plate itself doesn't match. */
function parseTrailingInitials(name: string): string | null {
  const match = name.match(/-\s*([A-Za-z]{2,4})\s*$/);
  return match ? match[1].toUpperCase() : null;
}

const FLEET_CACHE_TTL_MS = 8_000;
let cachedVehicles: LiveFleetVehicle[] | null = null;
let cachedAt = 0;

async function getLiveFleet(): Promise<LiveFleetVehicle[]> {
  if (cachedVehicles && Date.now() - cachedAt < FLEET_CACHE_TTL_MS) {
    return cachedVehicles;
  }

  // Vehicle positions matter more than driver-name matching: a Mongo hiccup shouldn't
  // blank out the whole live map, so a driver-lookup failure degrades to "no driver
  // matched" per vehicle instead of failing the request.
  const [devices, drivers] = await Promise.all([
    fetchGpsLiveDevices(),
    listDriverProfiles().catch(error => {
      log.warn("fleet route: driver lookup unavailable, showing positions without driver match", { error: String(error) });
      return [];
    })
  ]);

  // Plate is the authoritative signal once a driver has one on file; initials-matching
  // is only offered for drivers who have no van registration on file to match by instead.
  const driversByPlate = new Map<string, { initials: string; fullName: string }>();
  const driversByInitials = new Map<string, { initials: string; fullName: string }>();
  for (const d of drivers) {
    if (!d.initials) continue;
    if (d.vanRegistration) {
      driversByPlate.set(normalizePlate(d.vanRegistration), { initials: d.initials, fullName: d.fullName });
    } else {
      driversByInitials.set(d.initials, { initials: d.initials, fullName: d.fullName });
    }
  }

  const vehicles: LiveFleetVehicle[] = devices.map((device: GpsLiveDevice) => {
    const byPlate = driversByPlate.get(normalizePlate(device.plateNumber || ""));
    const trailingInitials = parseTrailingInitials(device.name || "");
    const byInitials = trailingInitials ? driversByInitials.get(trailingInitials) : undefined;
    const matched = byPlate || byInitials || null;
    const params = device.params || {};

    return {
      imei: device.imei, name: device.name, plateNumber: device.plateNumber,
      lat: device.lat, lng: device.lng,
      speedMph: Math.round((device.speed || 0) * 0.621371), // GPSLive reports km/h
      lastUpdate: device.dtTracker,
      driverInitials: matched?.initials ?? null, driverName: matched?.fullName ?? null,
      odometerMiles: device.odometer != null ? Math.round(device.odometer * 0.621371) : null,
      ignitionOn: params.acc === undefined ? null : params.acc === "1",
      batteryVoltage: toNumber(params.batv),
      gpsSignalLevel: toNumber(params.gpslev),
      gsmSignalLevel: toNumber(params.gsmlev),
      jammingDetected: params.jamming === "1",
      ecoDrivingEvent: params.ecodriving || null,
      ecoDrivingScore: toNumber(params.ecodrivingvalue)
    };
  });

  cachedVehicles = vehicles;
  cachedAt = Date.now();
  return vehicles;
}

export function dashboardFleetRoutes(): Router {
  const router = Router();

  router.get("/live", async (_req: Request, res: Response) => {
    try {
      const vehicles = await getLiveFleet();
      return res.status(200).json({ vehicles, fetchedAt: new Date().toISOString() });
    } catch (error) {
      log.error("fleet live lookup failed", error);
      return res.status(502).json({ error: { code: "FLEET_LOOKUP_FAILED", message: "Failed to fetch live vehicle positions." } });
    }
  });

  return router;
}
