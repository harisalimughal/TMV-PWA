/**
 * Dev mock data for the admin Vehicles and Settings pages: van records + compliance,
 * pricing/API settings, message templates and data maintenance. DEV ONLY (imported
 * from handlers.ts, excluded from `vite build`). Compliance dates are relative to
 * today, so every due status (overdue, due soon, current, missing) is always on screen.
 *
 * To see a partial save on Settings, enter 999 in any rate: that one key fails.
 */
import type { MockResponse } from "./handlers";
import type { EditableSetting, FactoryResetSummary, MessageCatalogItem } from "../screens/admin/dashboard/api";
import type { DriverSummaryItem, VanComplianceItem, VanDriverRecordItem, VanRecordItem } from "../screens/admin/dashboard/types";
import type { AdminDriver } from "../api/admin";

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const err = (status: number, code: string, message: string): MockResponse => ({ status, body: { error: { code, message } } });

const DAY_MS = 24 * 60 * 60 * 1000;
/** YYYY-MM-DD, `days` from today. */
const dateIn = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const isoAgo = (days: number, hour = 9) => {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

function photo(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue},35%,88%)"/><text x="200" y="160" font-family="sans-serif" font-size="28" text-anchor="middle" fill="hsl(${hue},30%,35%)">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---- vans ------------------------------------------------------------------- */

type VanSeed = {
  driver: string; initials: string; reg: string;
  /** Days from today; null = not recorded. */
  tax: number | null; mot: number | null;
  interval: number | null; lastService: number | null; odometer: number;
  fuelDaysAgo: number | null; serviceDaysAgo: number | null; notes?: string;
};

const VAN_SEEDS: VanSeed[] = [
  { driver: "Caio Almeida", initials: "CA", reg: "LK19 XRT", tax: -4, mot: 140, interval: 8000, lastService: 41200, odometer: 48650, fuelDaysAgo: 2, serviceDaysAgo: 210 },
  { driver: "Tiago Ferreira", initials: "TI", reg: "MV70 TMV", tax: 12, mot: 25, interval: 8000, lastService: 60100, odometer: 63900, fuelDaysAgo: 1, serviceDaysAgo: 95, notes: "Tyres replaced at last service." },
  { driver: "Wander Costa", initials: "WA", reg: "GX68 KLP", tax: 210, mot: 300, interval: 10000, lastService: 22000, odometer: 31750, fuelDaysAgo: 5, serviceDaysAgo: 180 },
  { driver: "Henrique Lima", initials: "HE", reg: "YH21 BNM", tax: 180, mot: -11, interval: 8000, lastService: 15500, odometer: 19900, fuelDaysAgo: 3, serviceDaysAgo: 60 },
  { driver: "Rafael Souza", initials: "RA", reg: "EF17 WQA", tax: null, mot: null, interval: null, lastService: null, odometer: 102340, fuelDaysAgo: null, serviceDaysAgo: null },
  { driver: "Aragao Silva", initials: "AR", reg: "BD22 HHT", tax: 95, mot: 3, interval: 12000, lastService: 5000, odometer: 9100, fuelDaysAgo: 0, serviceDaysAgo: 30 },
  { driver: "Maico Rocha", initials: "MA", reg: "SN66 CVE", tax: 330, mot: 280, interval: 8000, lastService: 72000, odometer: 74100, fuelDaysAgo: 9, serviceDaysAgo: 40 },
  { driver: "Lucas Pereira", initials: "LP", reg: "KR69 OZD", tax: 45, mot: 61, interval: 8000, lastService: 33000, odometer: 40800, fuelDaysAgo: 14, serviceDaysAgo: 120 }
];

function seedVans(): VanDriverRecordItem[] {
  return VAN_SEEDS.map((s, i) => {
    const email = `${s.driver.split(" ")[0].toLowerCase()}@themanvan.co.uk`;
    const base = { driverName: s.driver, driverEmail: email, driverInitials: s.initials, vanRegistration: s.reg };
    const records: VanRecordItem[] = [];
    if (s.fuelDaysAgo !== null) {
      records.push({ ...base, id: `van-${i}-fuel`, type: "FUEL", submittedAt: isoAgo(s.fuelDaysAgo, 8), odometerReading: s.odometer, fuelCost: 62 + i * 7.35, photoUrl: photo(`Fuel receipt ${s.reg}`, 40), thumbUrl: photo("Fuel", 40) });
    }
    records.push({ ...base, id: `van-${i}-mileage`, type: "MILEAGE", submittedAt: isoAgo((s.fuelDaysAgo ?? 6) + 1, 7), mileage: s.odometer - 120, photoUrl: photo(`Odometer ${s.reg}`, 210), thumbUrl: photo("Odometer", 210) });
    // Six months of weekly history behind the latest records, so the Fuel tab can chart it.
    if (s.fuelDaysAgo !== null) {
      const milesPerDay = 28 + (i * 9) % 30;
      for (let week = 1; week <= 26; week++) {
        const daysAgo = s.fuelDaysAgo + week * 7 - (week % 3);
        const odometer = Math.round(s.odometer - daysAgo * milesPerDay);
        records.push({ ...base, id: `van-${i}-fuel-h${week}`, type: "FUEL", submittedAt: isoAgo(daysAgo, 8), odometerReading: odometer, fuelCost: Math.round((58 + ((week * 17 + i * 11) % 34) + i * 2.5) * 100) / 100, photoUrl: photo(`Fuel receipt ${s.reg}`, 40), thumbUrl: photo("Fuel", 40) });
        records.push({ ...base, id: `van-${i}-mileage-h${week}`, type: "MILEAGE", submittedAt: isoAgo(daysAgo + 3, 7), mileage: odometer - 3 * milesPerDay, photoUrl: photo(`Odometer ${s.reg}`, 210), thumbUrl: photo("Odometer", 210) });
      }
    }
    if (s.serviceDaysAgo !== null && s.lastService !== null) {
      records.push({ ...base, id: `van-${i}-service`, type: "SERVICE", submittedAt: isoAgo(s.serviceDaysAgo, 12), serviceMileage: s.lastService, serviceType: i % 2 ? "Full service" : "Interim service", serviceDate: dateIn(-s.serviceDaysAgo), photoUrl: photo(`Service ${s.reg}`, 260), thumbUrl: photo("Service", 260) });
    }
    records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const compliance: VanComplianceItem | null = s.tax === null && s.mot === null && s.interval === null ? null : {
      vanRegistration: s.reg,
      roadTaxRenewalDate: s.tax === null ? undefined : dateIn(s.tax),
      motExpiryDate: s.mot === null ? undefined : dateIn(s.mot),
      notes: s.notes,
      updatedAt: isoAgo(20),
      serviceIntervalMiles: s.interval,
      lastServiceMileageOverride: null,
      lastServiceMileage: s.lastService,
      currentMileage: s.odometer
    };
    return {
      ...base,
      id: `van-driver-${i}`,
      latestSubmittedAt: records[0]?.submittedAt ?? isoAgo(30),
      latestMileage: records.find(r => r.type === "MILEAGE") ?? null,
      latestFuel: records.find(r => r.type === "FUEL") ?? null,
      latestService: records.find(r => r.type === "SERVICE") ?? null,
      compliance,
      records
    };
  });
}

/* ---- drivers ------------------------------------------------------------------ */

function roster(): AdminDriver[] {
  return VAN_SEEDS.map((v, i) => ({
    email: `${v.driver.split(" ")[0].toLowerCase()}@themanvan.co.uk`, initials: v.initials, fullName: v.driver,
    phone: `07700 9000${String(i).padStart(2, "0")}`, vanRegistration: v.reg, role: "driver",
    active: i !== 6, hasPassword: true, lastLoginAt: isoAgo(i % 3)
  }));
}

/** Per-driver stats for the Drivers directory and Performance summary. Deterministic, scaled by the range length. */
function driverSummary(query: URLSearchParams): DriverSummaryItem[] {
  const from = Date.parse(query.get("from") ?? "") || Date.now();
  const to = Date.parse(query.get("to") ?? "") || Date.now();
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1);
  return roster().map((d, i) => {
    const completed = Math.min(40, ((i * 3) % 4 + 1) * Math.ceil(days / 2));
    const revenue = completed * (240 + i * 15);
    const congestion = completed * (i % 2 ? 18 : 0), tunnel = completed * (i % 3 ? 0 : 13.6);
    return {
      initials: d.initials, fullName: d.fullName, email: d.email, phone: d.phone, vanRegistration: d.vanRegistration,
      active: d.active, hasAccount: true, assigned: completed + 1, completed, cancelled: i % 4 === 0 ? 1 : 0,
      completionRate: Math.round((completed / (completed + 1)) * 100), avgDurationMinutes: 150 + i * 6, totalDurationMinutes: completed * (150 + i * 6),
      avgDelayMinutes: i % 3 === 0 ? 7 : i % 3 === 1 ? -3 : 0, totalChargesPounds: revenue + congestion + tunnel, revenuePounds: revenue,
      revenueFormatted: `£${revenue.toFixed(2)}`, cashCollectedPounds: revenue * 0.4, cardCollectedPounds: revenue * 0.45, bankCollectedPounds: revenue * 0.15,
      invoiceCollectedPounds: 0, congestionChargePounds: congestion, tunnelChargePounds: tunnel, overtimeMinutes: completed * (i % 2 ? 20 : 5),
      missingEvidenceCount: i % 5 === 0 ? 1 : 0, overtimeCount: Math.floor(completed / 3), reviewSentCount: Math.floor(completed * 0.7), reviewNotSentCount: Math.ceil(completed * 0.3)
    };
  });
}

/** Async routes (the sample driver report fixture is async). */
export async function handleAdminRecordsAsync(method: string, path: string, query: URLSearchParams): Promise<MockResponse | null> {
  const report = path.match(/^\/api\/admin\/driver-reports\/([^/]+)$/);
  if (report && method === "GET") {
    const { sampleDriverReport } = await import("../screens/admin/dashboard/fixtures/driverReport.sample");
    const initials = decodeURIComponent(report[1]);
    const data = await sampleDriverReport(initials, Object.fromEntries(query.entries()));
    const driver = roster().find(d => d.initials === initials);
    return ok({ ...data, driver: { ...data.driver, name: driver?.fullName ?? data.driver.name, email: driver?.email ?? data.driver.email, hasCurrentAccount: Boolean(driver) } });
  }
  return null;
}

/* ---- settings ----------------------------------------------------------------- */

const SETTING_SPECS: Array<Omit<EditableSetting, "value">> = [
  { key: "CREW_RATE_1_MAN", label: "Normal Service — 1 Man (£)", type: "number", fallback: "45" },
  { key: "CREW_RATE_2_MAN", label: "Normal Service — 2 Man (£)", type: "number", fallback: "65" },
  { key: "CREW_RATE_3_MAN", label: "Normal Service — 3 Man (£)", type: "number", fallback: "85" },
  { key: "CREW_BILLING_UNIT", label: "Billing unit", type: "text", fallback: "per hour" },
  { key: "PACKING_RATE", label: "Packing rate per 30 min (£)", type: "number", fallback: "30" },
  { key: "CONGESTION_CHARGE", label: "Congestion charge (£)", type: "number", fallback: "18" },
  { key: "TUNNEL_CHARGE", label: "Tunnel charge (£)", type: "number", fallback: "13" },
  { key: "OVERTIME_RATE_PER_30", label: "Overtime rate per 30 min (£)", type: "number", fallback: "" },
  { key: "OVERTIME_GRACE_MINS", label: "Overtime grace (minutes)", type: "number", fallback: "15" },
  { key: "FIRETEXT_API_KEY", label: "FireText API key", type: "password", fallback: "", hint: "Sends customer and driver SMS." },
  { key: "FIRETEXT_SENDER_ID", label: "FireText sender ID", type: "text", fallback: "TheManVan" },
  { key: "GPS_API", label: "GPS Live API key", type: "password", fallback: "", hint: "Live van positions on the Fleet map." },
  { key: "TMV_GPSLIVE_WEBHOOK_TOKEN", label: "GPS Live webhook token", type: "password", fallback: "", hint: "Shared secret for GPS Live zone events." }
];

const SETTING_SEED: Record<string, string> = {
  CREW_RATE_1_MAN: "45", CREW_RATE_2_MAN: "70", CREW_RATE_3_MAN: "90", CREW_BILLING_UNIT: "per hour",
  PACKING_RATE: "32", CONGESTION_CHARGE: "18", TUNNEL_CHARGE: "13", OVERTIME_RATE_PER_30: "", OVERTIME_GRACE_MINS: "15",
  FIRETEXT_API_KEY: "ft_live_9c2e7d41a8", FIRETEXT_SENDER_ID: "TheManVan", GPS_API: "gps_5f1b0c3e72", TMV_GPSLIVE_WEBHOOK_TOKEN: ""
};

export const isPricingOrApiKey = (key: string) => /^CREW_RATE_\d+_MAN$/.test(key) || SETTING_SPECS.some(s => s.key === key);

/* ---- messages ----------------------------------------------------------------- */

type MessageSeed = Omit<MessageCatalogItem, "body" | "title" | "html"> ;

/** `body`/`title`/`html` start as the defaults, like a server with no edits saved yet. */
const MESSAGE_SEED: MessageCatalogItem[] = ([
  { id: "customer.booking_confirmed.sms", audience: "customer", channel: "SMS", label: "Booking confirmed", hint: "Sent when a job is booked.", variables: ["{customerName}", "{job_date}", "{job_time}"], enabled: true, hasTitle: false, hasHtml: false, bodyFallback: "Hi {customerName}, your move with The Man Van is booked for {job_date} at {job_time}." },
  { id: "customer.on_my_way.sms", audience: "customer", channel: "SMS", label: "Driver on the way", hint: "Sent when the driver taps On my way.", variables: ["{customerName}", "{driver_name}", "{vanRegistration}", "{driverPhone}"], enabled: true, hasTitle: false, hasHtml: false, bodyFallback: "Hi {customerName}, {driver_name} is on the way in van {vanRegistration}. Call {driverPhone} if you need anything." },
  { id: "customer.job_complete.email", audience: "customer", channel: "Email", label: "Job complete", hint: "Sent after the customer signs off.", variables: ["{customerName}", "{pickup}", "{dropoff}", "{jobId}"], enabled: true, hasTitle: true, hasHtml: true, titleFallback: "Your move is complete", bodyFallback: "Thanks {customerName}. Your move from {pickup} to {dropoff} is complete. Reference: {jobId}.", htmlEnabled: false, htmlFallback: "<p>Thanks {customerName}.</p><p>Your move from {pickup} to {dropoff} is complete.</p>" },
  { id: "customer.reminder.sms", audience: "customer", channel: "SMS", label: "Day-before reminder", hint: "Sent the day before the move.", variables: ["{customerName}", "{job_time}", "{leadMinutes}"], enabled: false, hasTitle: false, hasHtml: false, bodyFallback: "Hi {customerName}, a reminder that your move is tomorrow at {job_time}. Your driver will text {leadMinutes} minutes before arriving." },
  { id: "driver.job_assigned.push", audience: "driver", channel: "Push", label: "Job assigned", hint: "Sent when a job is assigned to the driver.", variables: ["{customerName}", "{job_date}", "{pickup}"], enabled: true, hasTitle: true, hasHtml: false, titleFallback: "New job", bodyFallback: "{customerName} on {job_date}, pickup at {pickup}" },
  { id: "driver.manual_details.sms", audience: "driver", channel: "SMS", label: "Manual details reminder", hint: "Sent when a finished job is missing manual details.", variables: ["{jobId}"], enabled: true, hasTitle: false, hasHtml: false, bodyFallback: "Please add the manual details for job {jobId}." }
] as MessageSeed[]).map(m => ({ ...m, body: m.bodyFallback, title: m.titleFallback, html: m.htmlFallback }));

/* ---- store + routes ----------------------------------------------------------- */

let vans = seedVans();
let settings: Record<string, string> = { ...SETTING_SEED };
let messages = MESSAGE_SEED.map(m => ({ ...m }));

export function resetAdminRecords(): void {
  vans = seedVans();
  settings = { ...SETTING_SEED };
  messages = MESSAGE_SEED.map(m => ({ ...m }));
}

function withinRange(iso: string, from: string | null, to: string | null): boolean {
  const day = iso.slice(0, 10);
  return (!from || day >= from.slice(0, 10)) && (!to || day <= to.slice(0, 10));
}

/** The van list for the page's filters: search narrows vehicles, the date range narrows records. */
function vanPage(query: URLSearchParams) {
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const from = query.get("from");
  const to = query.get("to");
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = 25;
  const matches = vans
    .filter(v => !q || [v.vanRegistration, v.driverName, v.driverEmail, v.driverInitials].some(f => f.toLowerCase().includes(q)))
    .map(v => {
      const records = v.records.filter(r => withinRange(r.submittedAt, from, to));
      return {
        ...v,
        records,
        latestMileage: records.find(r => r.type === "MILEAGE") ?? null,
        latestFuel: records.find(r => r.type === "FUEL") ?? null,
        latestService: records.find(r => r.type === "SERVICE") ?? null
      };
    });
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
  return {
    items: matches.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: matches.length, totalPages }
  };
}

export function settingsList(): EditableSetting[] {
  const customCrew = Object.keys(settings)
    .filter(key => /^CREW_RATE_\d+_MAN$/.test(key) && !SETTING_SPECS.some(s => s.key === key))
    .map(key => ({ key, label: `Normal Service — ${key.match(/\d+/)![0]} Man (£)`, type: "number" as const, fallback: "85" }));
  return [...SETTING_SPECS, ...customCrew].map(spec => ({ ...spec, value: settings[spec.key] ?? "" }));
}

export function saveMockSetting(key: string, value: string): MockResponse {
  if (!isPricingOrApiKey(key)) return err(400, "VALIDATION_FAILED", "Unknown setting key.");
  if (value === "999") return err(500, "MOCK_FAILURE", "Mock save failure (999 always fails).");
  settings[key] = value;
  return ok({ ok: true });
}

export function handleAdminRecords(method: string, path: string, bodyText: string | undefined, query: URLSearchParams): MockResponse | null {
  if (path === "/api/admin/drivers" && method === "GET") return ok({ drivers: roster() });
  if (path === "/api/admin/drivers/summary" && method === "GET") return ok({ drivers: driverSummary(query) });
  if (/^\/api\/admin\/gps\/jobs\/[^/]+\/charges$/.test(path) && method === "GET") return ok({ flags: [], comparisons: [], activity: [] });
  if (path === "/api/admin/van/drivers" && method === "GET") return ok(vanPage(query));
  if (path === "/api/admin/van/records" && method === "GET") {
    const items = vans.flatMap(v => v.records).filter(r => withinRange(r.submittedAt, query.get("from"), query.get("to")));
    return ok({ items, pagination: { page: 1, pageSize: items.length, total: items.length, totalPages: 1 } });
  }
  const compliance = path.match(/^\/api\/admin\/van\/compliance\/([^/]+)$/);
  if (compliance && method === "POST") {
    const reg = decodeURIComponent(compliance[1]);
    const van = vans.find(v => v.vanRegistration === reg);
    if (!van) return err(404, "NOT_FOUND", "No van with that registration.");
    const body = parse(bodyText);
    const override = body.lastServiceMileageOverride ?? null;
    const service = van.records.find(r => r.type === "SERVICE");
    const next: VanComplianceItem = {
      vanRegistration: reg,
      roadTaxRenewalDate: body.roadTaxRenewalDate || undefined,
      motExpiryDate: body.motExpiryDate || undefined,
      insuranceExpiryDate: body.insuranceExpiryDate || undefined,
      notes: body.notes || undefined,
      updatedAt: new Date().toISOString(),
      serviceIntervalMiles: body.serviceIntervalMiles ?? null,
      lastServiceMileageOverride: override,
      lastServiceMileage: override ?? service?.serviceMileage ?? van.compliance?.lastServiceMileage ?? null,
      currentMileage: van.compliance?.currentMileage ?? van.latestMileage?.mileage ?? null
    };
    van.compliance = next;
    return ok({ compliance: next });
  }
  const record = path.match(/^\/api\/admin\/van\/records\/([^/]+)$/);
  if (record && method === "DELETE") {
    const id = decodeURIComponent(record[1]);
    for (const van of vans) {
      van.records = van.records.filter(r => r.id !== id);
      if (van.latestFuel?.id === id) van.latestFuel = null;
      if (van.latestService?.id === id) van.latestService = null;
      if (van.latestMileage?.id === id) van.latestMileage = null;
    }
    return ok({ ok: true });
  }

  if (path === "/api/admin/messages" && method === "GET") return ok({ items: messages });
  const toggle = path.match(/^\/api\/admin\/messages\/([^/]+)\/toggle$/);
  if (toggle && method === "POST") {
    const msg = messages.find(m => m.id === decodeURIComponent(toggle[1]));
    if (!msg) return err(404, "NOT_FOUND", "Unknown message.");
    msg.enabled = Boolean(parse(bodyText).enabled);
    return ok({ ok: true });
  }
  const template = path.match(/^\/api\/admin\/messages\/([^/]+)$/);
  if (template && method === "POST") {
    const msg = messages.find(m => m.id === decodeURIComponent(template[1]));
    if (!msg) return err(404, "NOT_FOUND", "Unknown message.");
    Object.assign(msg, pick(parse(bodyText), ["title", "body", "html", "htmlEnabled"]));
    return ok({ ok: true });
  }

  if (path === "/api/admin/maintenance/factory-reset" && method === "POST") {
    if (parse(bodyText).confirm !== "RESET") return err(400, "VALIDATION_FAILED", "Type RESET to confirm.");
    const deleted: FactoryResetSummary = {
      evidence: 0, activity: 0, scenarioSubmissions: 0, vanRecords: vans.reduce((n, v) => n + v.records.length, 0),
      vanCompliance: vans.filter(v => v.compliance).length, exceptions: 0, pushSubscriptions: 0, cloudinaryAssetsDestroyed: 0
    };
    // Dummy data only: report what would go, then reseed so the pages stay populated.
    resetAdminRecords();
    return ok({ ok: true, deleted });
  }
  return null;
}

function parse(bodyText?: string): any {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return {};
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(k => k in source).map(k => [k, source[k]]));
}
