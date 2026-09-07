/**
 * Adapted from TMV-Chat-bot's dashboard/server/routes/fleet.route.ts. Same GPSLive
 * integration and vehicle-shape, but driver-name matching now comes from tmv-pwa's own
 * driver_accounts (listDriverProfiles()) instead of the Sheets Drivers tab -- simpler
 * too, since DriverProfile fields are already typed instead of raw row strings.
 */
import { Request, Response, Router } from "express";
import {
  buildDriverMatchIndex, fetchGpsLiveDevices, fetchGpsLiveZones, GpsLiveDevice, matchDriverByPlateAndName
} from "../../integrations/gpslive";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { jobsCollection } from "../../db/mongo";
import { ExtraChargeType } from "../../jobs/job.types";
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

  const driverIndex = buildDriverMatchIndex(drivers);

  const vehicles: LiveFleetVehicle[] = devices.map((device: GpsLiveDevice) => {
    const matched = matchDriverByPlateAndName(device.plateNumber || "", device.name || "", driverIndex);
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

export interface CongestionZonePolygon {
  zoneId: number;
  zoneName: string;
  /** [lat, lng] pairs, straight from GPSLive's own zone geometry -- not an
   *  approximation we maintain ourselves. */
  vertices: [number, number][];
}

// Zone shapes are hand-drawn in GPSLive's dashboard and change rarely if ever, unlike
// vehicle positions -- a much longer cache than getLiveFleet's is fine.
const ZONE_CACHE_TTL_MS = 5 * 60_000;
let cachedZones: CongestionZonePolygon[] | null = null;
let zonesCachedAt = 0;

/**
 * The Congestion Charge zone polygons already drawn in the client's GPSLive account
 * (Places > Zones -- "Congestion", "Congestion Zone NE/E/SW"), for drawing the same
 * shape on our own Live Fleet map. Deliberately excludes the account's other zones
 * ("Dartford Crossing", "Tunnels-Black-Silver") -- different charge, not this feature.
 */
async function getCongestionZones(): Promise<CongestionZonePolygon[]> {
  if (cachedZones && Date.now() - zonesCachedAt < ZONE_CACHE_TTL_MS) {
    return cachedZones;
  }

  const zones = await fetchGpsLiveZones();
  const congestionZones = zones
    .filter(z => z.zoneName.includes("Congestion"))
    .map(z => ({ zoneId: z.zoneId, zoneName: z.zoneName, vertices: z.zoneVertices }));

  cachedZones = congestionZones;
  zonesCachedAt = Date.now();
  return congestionZones;
}

export interface CongestionDetectionRow {
  jobId: string;
  customerName: string;
  driverInitials: string;
  driverName: string | null;
  vanRegistration: string | null;
  detectedAt: string;
  jobStatus: string;
  chargeAdded: boolean;
}

/**
 * Every job GPSLive (or the job-start check, see jobs/congestion-zone.service.ts)
 * has flagged as having entered the Congestion Charge zone -- lets ops see whether
 * the driver actually added the charge on the extra-charges step or not, which
 * congestionZoneEnteredAt alone doesn't answer.
 */
async function getCongestionDetections(): Promise<CongestionDetectionRow[]> {
  const col = await jobsCollection();
  const [jobs, drivers] = await Promise.all([
    col
      .find({ congestionZoneEnteredAt: { $exists: true, $ne: "" } } as any)
      .sort({ congestionZoneEnteredAt: -1 })
      .limit(100)
      .toArray(),
    listDriverProfiles().catch(error => {
      log.warn("congestion detections: driver lookup unavailable", { error: String(error) });
      return [];
    })
  ]);

  const driverByInitials = new Map(drivers.map(d => [d.initials, d]));

  return jobs.map(job => {
    const driver = driverByInitials.get(job.driverInitials);
    return {
      jobId: job.jobId,
      customerName: job.customerName || "",
      driverInitials: job.driverInitials || "",
      driverName: driver?.fullName ?? null,
      vanRegistration: driver?.vanRegistration ?? null,
      detectedAt: job.congestionZoneEnteredAt!,
      jobStatus: job.status,
      chargeAdded: (job.extraCharges || []).includes(ExtraChargeType.CONGESTION)
    };
  });
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

  router.get("/congestion-zones", async (_req: Request, res: Response) => {
    try {
      const zones = await getCongestionZones();
      return res.status(200).json({ zones });
    } catch (error) {
      log.error("congestion zones lookup failed", error);
      return res.status(502).json({ error: { code: "CONGESTION_ZONES_LOOKUP_FAILED", message: "Failed to fetch congestion zone shapes." } });
    }
  });

  router.get("/congestion", async (_req: Request, res: Response) => {
    try {
      const rows = await getCongestionDetections();
      return res.status(200).json({ rows });
    } catch (error) {
      log.error("congestion detections lookup failed", error);
      return res.status(502).json({ error: { code: "CONGESTION_LOOKUP_FAILED", message: "Failed to fetch congestion zone detections." } });
    }
  });

  return router;
}
