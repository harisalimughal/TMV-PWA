/**
 * Dev mock data for the admin Dispatch page: today's jobs, the summary KPIs and live
 * fleet positions. DEV ONLY (imported from handlers.ts, excluded from `vite build`).
 * Vans drift along fixed loops keyed to the clock so the radar visibly moves, and jobs
 * advance through the workflow every ~40 s so cards glide between board columns.
 */
import type { MockResponse } from "./handlers";

const ROUTES: Array<[string, string, string, number]> = [
  ["R. Murphy", "Flat 3, 41 Hornsey Rd, Holloway, London N7 7AA", "12 Church St, Enfield EN2 6AN", 2],
  ["H. Saleh", "8 Kennington Rd, Lambeth, London SE1 7BL", "77 Borough High St, Southwark, London SE1 1NP", 3],
  ["C. Clark", "15 Fulham Palace Rd, Fulham, London SW6 6TA", "1 Canada Sq, Canary Wharf, London E14 5AB", 1],
  ["E. Porziglia", "22 Camden High St, Camden, London NW1 0JH", "9 Mare St, Hackney, London E8 4RP", 2],
  ["G. Rustean", "4 Clapham Common S Side, Clapham, London SW4 7AA", "30 The Broadway, Wimbledon, London SW19 1RE", 2],
  ["A. White", "60 Upper St, Islington, London N1 0NY", "5 Romford Rd, Stratford, London E15 4LJ", 3],
  ["L. Chen", "18 Electric Ave, Brixton, London SW9 8JX", "2 George St, Croydon CR0 1PA", 2],
  ["T. Silva", "11 The Mall, Ealing, London W5 2PJ", "3 Hill St, Richmond TW9 1SX", 1],
  ["K. Evans", "7 Greenwich Church St, Greenwich, London SE10 9BJ", "40 Battersea Park Rd, Battersea, London SW8 4AA", 2],
  ["D. Mensah", "19 Hoe St, Walthamstow, London E17 4SD", "88 High Rd, Wembley HA9 6AA", 3]
];
const DRIVERS: Array<[string, string]> = [["CA", "Caio"], ["TI", "Tiago"], ["WA", "Wander"], ["HE", "Henrique"], ["RA", "Rafael"], ["AR", "Aragao"], ["MA", "Maico"], ["MV", "MAN VAN"]];
const FLOW = [
  "READY", "WAITING_ARRIVAL_PHOTO", "WAITING_LOADED_PHOTO", "IN_PROGRESS",
  "WAITING_EMPTY_VAN_PHOTO", "WAITING_CLIENT_CONFIRMATION", "WAITING_PAYMENT", "COMPLETED"
];
const START_STEP = [3, 2, 1, 0, 5, 7, 3, 7, 0, 4];

function todayAt(h: number, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function jobs() {
  const tick = Math.floor(Date.now() / 40_000);
  return ROUTES.map(([customer, pickup, dropoff, crew], i) => {
    const step = Math.min(FLOW.length - 1, START_STEP[i] + (START_STEP[i] === 0 ? 0 : Math.floor((tick + i) / 3) % 2));
    const state = FLOW[step];
    const [di, dn] = DRIVERS[i % DRIVERS.length];
    const done = state === "COMPLETED";
    return {
      jobId: `TMV-MOCK-${1000 + i}`,
      calendarEventId: `cal-${i}`,
      bookedStart: todayAt(7 + i, i % 2 ? 30 : 0),
      bookedFinish: todayAt(9 + i),
      bookedMinutes: 120,
      delayMinutes: 0,
      delayBand: "ON_TIME",
      timingTrustworthy: true,
      customerName: customer,
      pickup,
      dropoff,
      crewSize: crew,
      driverInitials: di,
      driverName: dn,
      status: done ? "COMPLETED" : state === "READY" ? "READY" : "IN_PROGRESS",
      currentState: state,
      workflowCompletionPct: 0,
      basePrice: 0,
      extraChargeSelections: [],
      extraCharges: 0,
      congestionCharge: 0,
      tunnelCharge: 0,
      overtimeMinutes: 0,
      overtimeCharge: 0,
      calculatedTotalCharges: 0,
      totalCharges: (180 + i * 35) * 100,
      amountCharged: done ? (180 + i * 35) * 100 : 0,
      reconciled: false,
      paymentMethod: "Card",
      paymentStatus: done ? "Paid" : "Pending",
      paidOnline: false,
      trackerStatus: i === 1 ? "stale" : "reporting",
      arrivalProofOverdue: i === 6,
      evidenceCompleteness: {
        arrival: "COMPLETED", vanLoaded: "COMPLETED", stopBy: "MISSING", emptyVan: "MISSING", organized: "MISSING",
        signature: i === 7 ? "MISSING" : done ? "COMPLETED" : "MISSING"
      },
      evidenceItems: [],
      scenarios: [],
      rawTitle: `${crew} men`,
      rawDescription: "",
      bookingDetails: {},
      activity: [],
      exceptions: i === 2 ? [{ type: "PAYMENT", detail: "Driver submission missing", timestamp: todayAt(10) }] : [],
      created: todayAt(6),
      updated: new Date().toISOString()
    };
  });
}

// Loops (lng, lat) each van drifts around; centre + radius in degrees.
const LOOPS: Array<[number, number, number, string]> = [
  [-0.11, 51.6, 0.03, "LN19 KXA"], [-0.1, 51.49, 0.012, "LD21 VAN"], [-0.1, 51.49, 0.06, "MV70 TMV"],
  [-0.09, 51.545, 0.025, "LT68 MOV"], [-0.2, 51.44, 0.02, "LV22 BOX"], [-0.05, 51.545, 0.03, "LX20 LUT"],
  [-0.1, 51.4, 0.02, "LB69 MAN"], [-0.28, 51.48, 0.02, "LG71 REM"]
];

function fleet() {
  const t = Date.now() / 1000;
  return LOOPS.map(([lng, lat, r, plate], i) => {
    const moving = i % 3 !== 1;
    const a = moving ? t / 45 + i : i;
    const [di, dn] = DRIVERS[i];
    return {
      imei: `86${i}000000000`,
      name: `Van ${i + 1}`,
      plateNumber: plate,
      lng: lng + Math.cos(a) * r * 1.6,
      lat: lat + Math.sin(a) * r,
      speedMph: moving ? 18 + (i * 7) % 15 : 0,
      lastUpdate: new Date(Date.now() - (i === 7 ? 25 * 60_000 : 20_000)).toISOString(),
      driverInitials: di,
      driverName: dn,
      odometerMiles: null,
      ignitionOn: moving,
      batteryVoltage: null,
      gpsSignalLevel: null,
      gsmSignalLevel: null,
      jammingDetected: false,
      ecoDrivingEvent: null,
      ecoDrivingScore: null
    };
  });
}

/** Days in the requested range (inclusive, capped), or the week ending today. */
function rangeDays(params: URLSearchParams): string[] {
  const day = 24 * 60 * 60 * 1000;
  // The picker sends UTC instants; bucket them by London calendar day like the API.
  const londonDay = (iso: string) => Date.parse(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" }));
  const to = londonDay(params.get("to") ?? new Date().toISOString());
  const from = params.get("from") ? londonDay(params.get("from")!) : to - 6 * day;
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return [new Date().toISOString().slice(0, 10)];
  const n = Math.min(92, Math.round((to - from) / day) + 1);
  return Array.from({ length: n }, (_, i) => new Date(from + i * day).toISOString().slice(0, 10));
}

/** Per-driver ranking from today's jobs, and revenue per day across the requested range, for Reports. */
function summaryCharts(params: URLSearchParams) {
  const byDriver = new Map<string, { driverName: string; initials: string; completed: number; active: number }>();
  for (const j of jobs()) {
    const row = byDriver.get(j.driverInitials) ?? { driverName: j.driverName, initials: j.driverInitials, completed: 0, active: 0 };
    if (j.status === "COMPLETED") row.completed += 1;
    else if (j.status === "IN_PROGRESS") row.active += 1;
    byDriver.set(j.driverInitials, row);
  }
  const revenueOverTime = rangeDays(params).map(date => {
    const seed = Number(date.slice(8, 10)) + Number(date.slice(5, 7)) * 3;
    const weekend = [0, 6].includes(new Date(date).getUTCDay());
    const jobsCount = (weekend ? 2 : 5) + (seed * 7) % 5;
    return { date, revenuePounds: jobsCount * (210 + (seed * 13) % 90), jobsCount };
  });
  return {
    statusBreakdown: [],
    revenueOverTime,
    paymentMethodSplit: [{ method: "Card", totalPounds: 620, count: 3 }, { method: "Cash", totalPounds: 160, count: 1 }],
    jobsByDriver: [...byDriver.values()]
  };
}

export function handleAdminDispatch(method: string, path: string, params = new URLSearchParams()): MockResponse | null {
  if (method !== "GET") return null;
  if (path === "/api/admin/jobs") {
    const items = jobs();
    return {
      status: 200,
      body: {
        items,
        pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1 },
        meta: { fetchedAt: new Date().toISOString(), durationMs: 4 }
      }
    };
  }
  if (path === "/api/admin/summary") {
    const charts = summaryCharts(params);
    const days = charts.revenueOverTime;
    // One day = today's live jobs (Dispatch); a longer range = the per-day series added up,
    // so Reports' tiles agree with its chart.
    const multi = days.length > 1;
    const revenuePounds = multi ? days.reduce((s, d) => s + d.revenuePounds, 0) : jobs().reduce((s, j) => s + j.amountCharged / 100, 0);
    const totalJobs = multi ? days.reduce((s, d) => s + d.jobsCount, 0) : 10;
    const cashCollectedPounds = multi ? Math.round(revenuePounds * 0.18) : 0;
    if (multi) {
      const cardShare = revenuePounds - cashCollectedPounds;
      charts.paymentMethodSplit = [
        { method: "Card", totalPounds: Math.round(cardShare * 0.7), count: Math.round(totalJobs * 0.55) },
        { method: "Bank transfer", totalPounds: Math.round(cardShare * 0.3), count: Math.round(totalJobs * 0.2) },
        { method: "Cash", totalPounds: cashCollectedPounds, count: Math.round(totalJobs * 0.2) }
      ];
    }
    return {
      status: 200,
      body: {
        kpis: {
          totalJobs, scheduled: 2, inProgress: 6, completed: totalJobs - 8, cancelled: 0, late: multi ? 3 : 1, incomplete: 0,
          revenuePounds, revenueFormatted: `£${revenuePounds}`, cashCollectedPounds, cardBankPounds: revenuePounds - cashCollectedPounds,
          extraChargesPounds: 0, overtimePounds: 0, photosMissing: 0, photosProcessing: 0, photosFailed: 0,
          missingSignatures: 1, driversWorkingCount: 6, avgDurationMinutes: 120, avgDelayMinutes: multi ? 7 : 0
        },
        charts,
        meta: { fetchedAt: new Date().toISOString(), durationMs: 3 }
      }
    };
  }
  const detail = path.match(/^\/api\/admin\/jobs\/([^/]+)$/);
  if (detail) {
    const job = jobs().find(j => j.jobId === decodeURIComponent(detail[1]));
    return job ? { status: 200, body: { job } } : null;
  }
  if (path === "/api/admin/fleet/live") {
    return { status: 200, body: { vehicles: fleet(), fetchedAt: new Date().toISOString() } };
  }
  return null;
}
