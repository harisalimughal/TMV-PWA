/**
 * Dev-only admin dashboard fixtures for visual QA (see install.ts). Every person,
 * phone, email, address and registration here is fictional. The last seven days of
 * jobs follow a jobs export (fixtures/exportJobs.ts) with customers anonymised. Writes are accepted in memory and never leave the browser -- no
 * message is sent, no price or job changes anywhere real.
 *
 * Times are generated relative to "now" in London so Today's jobs, fresh vs stale
 * trackers and due-soon dates always render the states they are meant to show.
 */
import { DateTime } from "luxon";
import type { MockResponse } from "./handlers";
import { handleBooking } from "./booking";
import type { NormalizedJob, ScenarioItem, VanDriverRecordItem, VanRecordItem, DriverSummaryItem } from "../screens/admin/dashboard/types";
import type { AlertRow, LiveFleetVehicle, NotificationRow, MessageCatalogItem } from "../screens/admin/dashboard/api";
import { sampleDriverReport } from "../screens/admin/dashboard/fixtures/driverReport.sample";
import { EXPORT_JOBS, type ExportJob } from "./fixtures/exportJobs";
import { handleActivity } from "./activity";

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const csvCell = (value: unknown) => { const text = value === null || value === undefined ? "" : String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const csvFile = (filename: string, header: string[], rows: unknown[][]): MockResponse =>
  ({ status: 200, body: [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n"), file: { contentType: "text/csv; charset=utf-8", filename } });
const notFound = (message: string): MockResponse => ({ status: 404, body: { error: { code: "NOT_FOUND", message } } });
const parse = (text?: string) => { try { return text ? JSON.parse(text) : {}; } catch { return {}; } };

const zone = "Europe/London";
const today = () => DateTime.now().setZone(zone).startOf("day");
const at = (dayOffset: number, hour: number, minute = 0) => today().plus({ days: dayOffset }).set({ hour, minute }).toUTC().toISO()!;
const trackerTime = (minutesAgo: number) => DateTime.utc().minus({ minutes: minutesAgo }).toFormat("yyyy-LL-dd HH:mm:ss");

/**
 * The real TMV roster: the nine names and codes from the deployed dashboard's driver
 * picker (docs/DRIVER_DATA.md). Codes are kept exactly (Caio is KA). Their emails and
 * phones are not in any file this repo has, so they stay empty ("Not recorded"); the
 * three van registrations are demo values so the Van and Live fleet pages have data.
 */
const DRIVERS = [
  { initials: "AR", fullName: "Aragao", email: "", phone: "", vanRegistration: "", active: true },
  { initials: "KA", fullName: "Caio", email: "", phone: "", vanRegistration: "AB12CDE", active: true },
  { initials: "HE", fullName: "Henrique", email: "", phone: "", vanRegistration: "", active: true },
  { initials: "MK", fullName: "Maico", email: "", phone: "", vanRegistration: "", active: true },
  { initials: "MA", fullName: "MAN VAN", email: "", phone: "", vanRegistration: "", active: true },
  { initials: "PL", fullName: "Paulo", email: "", phone: "", vanRegistration: "", active: true },
  { initials: "RF", fullName: "Rafael", email: "", phone: "", vanRegistration: "EF56GHJ", active: true },
  { initials: "TI", fullName: "Tiago", email: "", phone: "", vanRegistration: "CD34EFG", active: true },
  { initials: "WD", fullName: "Wander", email: "", phone: "", vanRegistration: "", active: true }
];
const driverName = (initials: string) => DRIVERS.find(driver => driver.initials === initials)?.fullName ?? "";

const COMPLETE = { arrival: "COMPLETED", vanLoaded: "COMPLETED", stopBy: "MISSING", emptyVan: "COMPLETED", organized: "MISSING", signature: "COMPLETED" } as const;

function job(id: string, patch: Partial<NormalizedJob> & { start: string; minutes?: number }): NormalizedJob {
  const { start, minutes = 120, ...rest } = patch;
  const finish = DateTime.fromISO(start).plus({ minutes }).toUTC().toISO()!;
  const driverInitials = rest.driverInitials ?? "KA";
  return {
    jobId: id, calendarEventId: `cal-${id}`, bookedStart: start, bookedFinish: finish, bookedMinutes: minutes, allocatedMinutes: minutes,
    delayMinutes: 0, delayBand: "ON_TIME", timingTrustworthy: true, customerName: "Customer", pickup: "1 Example Street, London", dropoff: "2 Sample Road, London",
    crewSize: 2, driverInitials, driverName: driverName(driverInitials), status: "READY", currentState: "READY", workflowCompletionPct: 0,
    basePrice: 23000, extraChargeSelections: [], extraCharges: 0, congestionCharge: 0, tunnelCharge: 0, overtimeMinutes: 0, overtimeCharge: 0,
    calculatedTotalCharges: 23000, totalCharges: 23000, amountCharged: undefined as unknown as number, reconciled: false, paymentMethod: "", paymentStatus: "",
    paidOnline: false, evidenceCompleteness: { arrival: "MISSING", vanLoaded: "MISSING", stopBy: "MISSING", emptyVan: "MISSING", organized: "MISSING", signature: "MISSING" },
    evidenceItems: [], scenarios: [], rawTitle: `2 men 115£/Y-${driverInitials}`, rawDescription: "Booking text (sample)\nClient name: Sample\nPhone: 07000 000000",
    bookingDetails: { vanSize: "Luton van" }, activity: [], exceptions: [], created: start, updated: start,
    customerEmail: "customer@example.test", customerPhone: "07000 000999",
    ...rest
  } as NormalizedJob;
}

/** A job from the anonymised export fixture (fixtures/exportJobs.ts). */
function fromExport(row: ExportJob): NormalizedJob {
  const when = (value: [number, number, number] | null) => value ? at(value[0], value[1], value[2]) : undefined;
  const methods = row.method ? row.method.split(",").map(method => method.trim()) : [];
  const completed = row.status === "COMPLETED";
  const evidence = { arrival: "MISSING", vanLoaded: "MISSING", stopBy: "MISSING", emptyVan: "MISSING", organized: "MISSING", signature: "MISSING", ...row.evidence } as NormalizedJob["evidenceCompleteness"];
  return job(row.id, {
    start: when(row.start)!, minutes: row.minutes ?? 120, driverInitials: row.driver, driverName: driverName(row.driver), customerName: row.customer,
    customerPhone: row.phone, pickup: row.pickup, dropoff: row.dropoff, status: row.status, currentState: row.status,
    actualStart: when(row.actualStart), actualFinish: when(row.actualFinish), actualMinutes: row.actualMinutes ?? undefined,
    delayMinutes: row.delay ?? 0, delayBand: (row.band || "ON_TIME") as NormalizedJob["delayBand"], arrivalDelaySource: row.delay === null ? "unavailable" : "gps-two-fresh-reports",
    basePrice: row.base ?? 0, extraCharges: row.extra ?? 0, overtimeCharge: row.overtime ?? 0,
    totalCharges: row.total ?? undefined, calculatedTotalCharges: row.total ?? undefined, amountCharged: completed ? row.charged ?? undefined : undefined,
    paymentMethod: row.method, paymentStatus: row.payment, paidOnline: row.payment === "Paid Online",
    // The export gives one total per job, so a split is only recorded for a single method.
    paymentBreakdown: completed && methods.length === 1 && row.charged !== null ? [{ method: methods[0], amount: row.charged }] : [],
    timeBillingStatus: (row.billing || undefined) as NormalizedJob["timeBillingStatus"], evidenceCompleteness: evidence,
    workflowCompletionPct: completed ? 100 : row.status === "IN_PROGRESS" ? 40 : 0,
    crewSize: undefined, rawTitle: "", rawDescription: "", bookingDetails: {}, customerEmail: undefined
  } as Partial<NormalizedJob> & { start: string; minutes?: number });
}

/**
 * Jobs that exercise the job preview and the Job Report: a fully documented completed job
 * with photos, a long booking text, extras and a driver submission; a job still on its way
 * with an unverified tracker; a scheduled job with gaps; and a cancelled one. Photos are
 * generated placeholders, never real pictures.
 */
function scenarioJobs(): NormalizedJob[] {
  const t = (offset: number, hour: number, minute: number) => at(offset, hour, minute);
  const photo = (id: string, category: NormalizedJob["evidenceItems"][number]["category"], label: string, hue: number, when: string, extra: Record<string, unknown> = {}) => ({
    id, fileId: id, category, state: "COMPLETED" as const, provenance: "recorded" as const, fileName: `${id}.jpg`, receivedAt: when, completedAt: when, capturedAt: when,
    driveUrl: mockPhoto(label, hue), thumbProxyUrl: mockPhoto(label, hue), location: { lat: 51.4613, lng: -0.1157, accuracy: 12 }, locationName: "Brixton, London", ...extra
  });
  const longText = [
    "Booking confirmed by phone. Customer: Rowan & Sons (Café) <Ltd>",
    "Pickup: Flat 4, 12 Brixton Hill, SW2 1AA (3rd floor, no lift, parking bay outside).",
    "Delivery: Unit 9, Riverside Business Park, SE16 4QZ. Loading bay opens 08:00, ask for Sam.",
    "Inventory: 2 x wardrobes, 1 x sofa (3 seat), 14 x boxes, piano (upright) & \"fragile\" glass table.",
    "Access notes: https://example.test/access-instructions/very/long/path/that/keeps/going/and/going/with-no-natural-break-points-at-all?ref=booking-1234567890&token=abcdefghijklmnopqrstuvwxyz0123456789#section",
    "Payment: card on the day, balance by invoice. Contact 07700 900123 or rowan@example.test",
    "<script>alert('not run')</script> Keep tidy. Thank you!"
  ].join("\n");
  const rich = job("TMV-1101", {
    start: t(-1, 9, 0), minutes: 240, driverInitials: "KA", status: "COMPLETED", currentState: "COMPLETED", customerName: "Rowan & Sons Café", customerPhone: "07700 900123", customerEmail: "rowan@example.test",
    pickup: "Flat 4, 12 Brixton Hill, London SW2 1AA", dropoff: "Unit 9, Riverside Business Park, London SE16 4QZ", floorFrom: "3rd (no lift)", floorTo: "Ground",
    onMyWayAt: t(-1, 8, 15), trackerArrivalAt: t(-1, 8, 56), trackerArrivalDistanceMeters: 38, pickupArrivalAt: t(-1, 9, 4), vanLoadedAt: t(-1, 11, 20), actualStart: t(-1, 8, 56), actualFinish: t(-1, 13, 10),
    clientSignatureAt: t(-1, 13, 15), clientConfirmedName: "R. Rowan", actualMinutes: 254, delayMinutes: -4, arrivalDelaySource: "gps-two-fresh-reports",
    dropoffTracking: { arrivalAt: t(-1, 12, 22), departureAt: t(-1, 13, 18) },
    basePrice: 36000, extraChargeBreakdown: [{ label: "Piano handling", amount: 6000 }, { label: "Extra time", amount: 3000 }], extraCharges: 6000, congestionCharge: 1500, overtimeCharge: 3000,
    calculatedTotalCharges: 46500, totalCharges: 46500, amountCharged: 45000, totalAdjustmentNote: "Goodwill reduction agreed with the customer", paymentMethod: "Card, Invoice", paymentStatus: "Recorded",
    paymentBreakdown: [{ method: "Card", amount: 25000 }, { method: "Invoice", amount: 20000 }],
    timeBilling: { ruleVersion: "demo", scheduledMinutes: 240, allocatedMinutes: 240, actualMinutes: 254, extraMinutes: 14, billedExtraBlocks: 1, billedExtraMinutes: 30, ratePer30Pence: 3000, rateSource: "settings", extraChargePence: 3000 },
    timeBillingStatus: "verified", workflowCompletionPct: 100, evidenceCompleteness: { ...COMPLETE },
    evidenceItems: [
      photo("p1", "Arrival", "Arrival", 200, t(-1, 9, 4)), photo("p2", "VanLoaded", "Van loaded", 150, t(-1, 11, 20)),
      photo("p3", "StopBy", "Stop-by", 40, t(-1, 12, 5)), photo("p4", "EmptyVan", "Empty van", 280, t(-1, 13, 10)),
      { ...photo("p5", "Signature", "Signature", 0, t(-1, 13, 15)), location: undefined, locationName: undefined }
    ],
    signatureUrl: mockPhoto("Signature", 0), rawTitle: "4 hrs 2 men 115£ Rowan & Sons Café / KA", rawDescription: longText,
    bookingDetails: { vanSize: "Luton van", hireDuration: "4 hours", notes: "Customer asked for the piano to be wrapped. Loading bay opens 08:00.", inventory: "2 x wardrobes, 3-seat sofa, 14 boxes, upright piano, glass table", extraChargeText: "Piano handling" },
    driverViewedAt: t(-2, 17, 30), managerReviewStatus: "Pending",
    driverJobSummary: { jobId: "TMV-1101", driverInitials: "KA", driverEmail: "", startTime: t(-1, 8, 56), endTime: t(-1, 13, 10), congestionCharge: true, congestionChargePence: 1500, helperName: "Sample Helper", helperHours: 4, paymentMethod: "Card, Invoice",
      amountCollectedPence: 25000, driverJobHours: 4.2, submittedAt: t(-1, 14, 0) } as NormalizedJob["driverJobSummary"],
    driverReportedOvertimeMinutes: 0,
    activity: [
      { timestamp: t(-3, 10, 0), driver: "System", action: "JOB_CREATED", detail: "Imported from the Calendar booking" },
      { timestamp: t(-2, 17, 30), driver: "KA", action: "JOB_VIEWED", detail: "Driver opened the job" },
      { timestamp: t(-1, 8, 15), driver: "KA", action: "ON_MY_WAY", fromState: "READY", toState: "ON_MY_WAY" },
      { timestamp: t(-1, 9, 4), driver: "KA", action: "ARRIVAL_PHOTO_UPLOADED", detail: "Proof of arrival" },
      { timestamp: t(-1, 13, 15), driver: "KA", action: "SIGNATURE_CAPTURED", detail: "Signed as R. Rowan" },
      { timestamp: t(-1, 14, 0), driver: "KA", action: "PAYMENT_RECORDED", detail: "Card £250.00, invoice £200.00" },
      { timestamp: t(-1, 14, 5), driver: "System", action: "JOB_COMPLETED", fromState: "FINISHING", toState: "COMPLETED" }
    ]
  } as Partial<NormalizedJob> & { start: string; minutes?: number });
  const active = job("TMV-1102", {
    start: t(0, 10, 0), driverInitials: "RF", status: "IN_PROGRESS", currentState: "ARRIVED", customerName: "Avery Placeholder", onMyWayAt: t(0, 9, 20), actualStart: t(0, 10, 12),
    trackerUnverifiedReason: "GPS reports were older than 5 minutes", pickupArrivalAt: t(0, 10, 12), arrivalDelaySource: "unavailable", workflowCompletionPct: 25,
    evidenceCompleteness: { ...COMPLETE, vanLoaded: "MISSING", emptyVan: "MISSING", signature: "MISSING" }, evidenceItems: [photo("a1", "Arrival", "Arrival", 200, t(0, 10, 12))],
    activity: [{ timestamp: t(0, 9, 20), driver: "RF", action: "ON_MY_WAY" }]
  } as Partial<NormalizedJob> & { start: string; minutes?: number });
  const scheduled = job("TMV-1103", { start: t(1, 8, 30), driverInitials: "", driverName: "", customerName: "", pickup: "17 Example Gardens, London N1 9AB", dropoff: "", customerPhone: "Not recorded", customerEmail: undefined, rawTitle: "", rawDescription: "" } as Partial<NormalizedJob> & { start: string; minutes?: number });
  const cancelled = job("TMV-1104", { start: t(-2, 13, 0), driverInitials: "TI", status: "CANCELLED", currentState: "CANCELLED", customerName: "Sky Specimen", activity: [{ timestamp: t(-3, 9, 0), driver: "System", action: "JOB_CANCELLED", detail: "Cancelled by the customer" }] } as Partial<NormalizedJob> & { start: string; minutes?: number });
  return [rich, active, scheduled, cancelled];
}

function buildJobs(): NormalizedJob[] {
  const list: NormalizedJob[] = [
    ...EXPORT_JOBS.map(fromExport),
    // Two states the export week does not contain, kept so attention screens can be previewed.
    job("TMV-1004", { start: at(0, 11), driverInitials: "TI", status: "IN_PROGRESS", currentState: "ARRIVED", customerName: "Drew Sample", actualStart: at(0, 11, 5),
      trackerStatus: "stale", trackerArrivalAt: at(0, 10, 58), arrivalProofOverdue: true, arrivalProofDelayMinutes: 22, workflowCompletionPct: 20 }),
    job("TMV-1006", { start: at(0, 14, 30), driverInitials: "", driverName: "", customerName: "Finley Sample" }),
    // The export week has no job for Paulo, so one fictional job keeps all nine real drivers visible in Activity.
    job("TMV-1007", { start: DateTime.now().minus({ minutes: 30 }).toUTC().toISO()!, driverInitials: "PL", status: "IN_PROGRESS", currentState: "ARRIVED", customerName: "Reese Sample", actualStart: DateTime.now().minus({ minutes: 25 }).toUTC().toISO()!, workflowCompletionPct: 20 }),
    ...scenarioJobs()
  ];
  const names = ["Indy Sample", "Jules Example", "Kai Placeholder", "Lee Sample", "Morgan Example", "Noel Placeholder", "Oak Sample", "Parker Example", "Quinn Sample"];
  // 60 days of fictional history; deterministic so screenshots are repeatable.
  // Older history (the export covers the last seven days).
  for (let day = 7; day <= 60; day += 1) {
    const perDay = 2 + ((day * 7) % 4);
    for (let slot = 0; slot < perDay; slot += 1) {
      const n = day * 5 + slot;
      const driver = ["KA", "TI", "RF"][(day + slot) % 3];
      const cancelled = n % 13 === 0;
      const amount = 21000 + (n % 5) * 2500 + (slot === 3 ? 9000 : 0);
      const method = n % 6 === 0 ? "Invoice" : n % 4 === 0 ? "Card" : n % 9 === 0 ? "Bank Transfer" : n % 11 === 0 ? "Link" : "Cash";
      const verified = n % 7 !== 0;
      const delay = verified ? [-3, 0, 4, 12, -1, 0, 25, 2][n % 8] : 0;
      const minutes = 110 + (n % 6) * 15;
      list.push(job(`TMV-${String(5000 + n).padStart(5, "0")}`, { start: at(-day, 8 + slot * 2, slot % 2 ? 30 : 0), driverInitials: driver, status: cancelled ? "CANCELLED" : "COMPLETED", customerName: names[n % names.length],
        ...(cancelled ? {} : {
          actualStart: at(-day, 8 + slot * 2, 5), actualFinish: at(-day, 10 + slot * 2, 15), actualMinutes: n % 17 === 0 ? undefined : minutes,
          delayMinutes: delay, arrivalDelaySource: verified ? "gps-two-fresh-reports" : "unavailable", overtimeMinutes: n % 5 === 0 ? 30 : 0,
          evidenceCompleteness: n % 5 === 0 ? { ...COMPLETE, signature: "MISSING" } : COMPLETE,
          amountCharged: n % 19 === 0 ? undefined : amount, totalCharges: amount, calculatedTotalCharges: amount, paymentMethod: method,
          paymentBreakdown: n % 23 === 0 ? [] : [{ method, amount: method === "Invoice" && n % 4 === 0 ? 0 : amount }], workflowCompletionPct: 100
        }) } as Partial<NormalizedJob> & { start: string }));
    }
  }
  return list;
}

let JOBS = buildJobs();
const store = {
  settings: {
    CREW_RATE_2_MAN: "", CREW_RATE_3_MAN: "70", PACKING_RATE: "", CONGESTION_CHARGE: "", TUNNEL_CHARGE: "", OVERTIME_RATE_PER_30: "", OVERTIME_GRACE_MINS: "",
    CREW_BILLING_UNIT: "", FIRETEXT_API_KEY: "", FIRETEXT_SENDER_ID: "", GPS_API: "", TMV_GPSLIVE_WEBHOOK_TOKEN: ""
  } as Record<string, string>,
  messages: [] as MessageCatalogItem[],
  dismissedNotifications: new Set<string>(),
  dismissedAlerts: new Set<string>()
};

const SETTING_SPECS: Array<{ key: string; label: string; type: "text" | "textarea" | "number" | "password"; fallback: string; hint?: string }> = [
  { key: "LIABILITY_DAMAGE_CATEGORIES", label: "Liability damage categories", type: "textarea", fallback: JSON.stringify(["Wall", "Floor", "Door frame", "Furniture"]) },
  { key: "CREW_RATE_2_MAN", label: "2-person crew", type: "number", fallback: "55" },
  { key: "CREW_RATE_3_MAN", label: "3-person crew", type: "number", fallback: "65" },
  { key: "CREW_BILLING_UNIT", label: "Billing unit", type: "text", fallback: "hour" },
  { key: "PACKING_RATE", label: "Packing rate", type: "number", fallback: "40" },
  { key: "CONGESTION_CHARGE", label: "Congestion Charge", type: "number", fallback: "18" },
  { key: "TUNNEL_CHARGE", label: "Tunnel charge", type: "number", fallback: "13.60" },
  { key: "OVERTIME_RATE_PER_30", label: "Overtime rate", type: "number", fallback: "" },
  { key: "OVERTIME_GRACE_MINS", label: "Overtime grace period", type: "number", fallback: "10" },
  { key: "FIRETEXT_API_KEY", label: "Firetext API key", type: "password", fallback: "", hint: "Used to send customer SMS." },
  { key: "FIRETEXT_SENDER_ID", label: "SMS sender name", type: "text", fallback: "", hint: "Up to 11 characters shown as the sender." },
  { key: "GPS_API", label: "GPSLive API key", type: "password", fallback: "" },
  { key: "TMV_GPSLIVE_WEBHOOK_TOKEN", label: "GPSLive webhook token", type: "password", fallback: "" }
];

function messages(): MessageCatalogItem[] {
  if (store.messages.length) return store.messages;
  store.messages = [
    { id: "customer-confirmation", audience: "customer", channel: "Email", label: "Booking confirmation", hint: "Sent when a booking syncs from the Calendar.", variables: ["{customerName}", "{job_date}", "{job_time}", "{pickup}"], enabled: true, hasTitle: true, hasHtml: true, title: "Your move on {job_date}", titleFallback: "Your move on {job_date}", body: "Hi {customerName}, your move is booked for {job_date} at {job_time} from {pickup}.", bodyFallback: "Hi {customerName}, your move is booked for {job_date} at {job_time}.", html: "", htmlEnabled: false, htmlFallback: "" },
    { id: "customer-on-my-way", audience: "customer", channel: "SMS", label: "Driver on the way", hint: "Sent when the driver taps On my way.", variables: ["{customerName}", "{driver_name}", "{leadMinutes}", "{vanRegistration}"], enabled: true, hasTitle: false, hasHtml: false, body: "Hi {customerName}, {driver_name} is on the way and should arrive in about {leadMinutes} minutes in van {vanRegistration}.", bodyFallback: "Hi {customerName}, your driver is on the way." },
    { id: "customer-review", audience: "customer", channel: "Email", label: "Review request", hint: "Sent after the job is completed.", variables: ["{customerName}", "{companyName}"], enabled: false, hasTitle: true, hasHtml: true, title: "How did we do?", titleFallback: "How did we do?", body: "Hi {customerName}, thanks for choosing {companyName}.", bodyFallback: "Thanks for choosing {companyName}.", html: "", htmlEnabled: false, htmlFallback: "" },
    { id: "driver-new-job", audience: "driver", channel: "Push", label: "New job assigned", hint: "Push to the assigned driver.", variables: ["{jobId}", "{job_date}", "{job_time}"], enabled: true, hasTitle: true, hasHtml: false, title: "New job {jobId}", titleFallback: "New job", body: "You have a job on {job_date} at {job_time}.", bodyFallback: "You have a new job." }
  ];
  return store.messages;
}

function vehicles(): LiveFleetVehicle[] {
  const base = { odometerMiles: 48210, ignitionOn: true, batteryVoltage: 12.6, gpsSignalLevel: 4, gsmSignalLevel: 3, jammingDetected: false, ecoDrivingEvent: null, ecoDrivingScore: null };
  return [
    { ...base, imei: "100000000000001", name: "Van 1", plateNumber: "AB12 CDE", lat: 51.507, lng: -0.142, speedMph: 24, lastUpdate: trackerTime(1), driverInitials: "KA", driverName: "Caio" },
    { ...base, imei: "100000000000002", name: "Van 2", plateNumber: "CD34 EFG", lat: 51.523, lng: -0.083, speedMph: 0, lastUpdate: trackerTime(47), driverInitials: "TI", driverName: "Tiago", ignitionOn: false },
    { ...base, imei: "100000000000003", name: "Van 3", plateNumber: "EF56 GHJ", lat: 51.482, lng: -0.19, speedMph: 0, lastUpdate: trackerTime(3), driverInitials: "RF", driverName: "Rafael" },
    { ...base, imei: "100000000000004", name: "Spare van", plateNumber: "GH78 JKL", lat: 51.55, lng: -0.05, speedMph: 0, lastUpdate: trackerTime(400), driverInitials: null, driverName: null, ignitionOn: null }
  ];
}

function notifications(): NotificationRow[] {
  const row = (jobId: string, customerName: string, driverInitials: string, start: string, email: NotificationRow["email"]["state"], sms: NotificationRow["sms"]["state"], detail = ""): NotificationRow => ({
    jobId, customerName, customerEmail: "customer@example.test", customerPhone: sms === "skipped" ? "" : "07000 000999", driverInitials, actualStart: start,
    email: { state: email, detail: email === "failed" ? detail || "Mailbox unavailable" : "", at: start }, sms: { state: sms, detail: sms === "failed" ? detail || "Number rejected by carrier" : "", at: start }
  });
  return [
    ...EXPORT_JOBS.filter(item => item.start[0] === 0 && item.customer).slice(0, 4).map((item, index) =>
      row(item.id, item.customer, item.driver, at(0, item.start[1], item.start[2]), (["sent", "failed", "sent", "pending"] as const)[index], (["sent", "sent", "failed", "pending"] as const)[index])),
    row("TMV-1004", "Drew Sample", "TI", at(0, 10, 40), "sent", "skipped"),
    row("TMV-0904", "Indy Sample", "KA", at(-1, 7, 40), "sent", "disabled")
  ].filter(item => !store.dismissedNotifications.has(item.jobId));
}

function alerts(): AlertRow[] {
  const row = (eventId: string, type: string, description: string, category: AlertRow["category"], device: string, initials: string | null, minutesAgo: number): AlertRow =>
    ({ eventId, type, description, category, deviceName: device, driverInitials: initials, driverName: initials ? driverName(initials) : null, detectedAt: trackerTime(minutesAgo) });
  return [
    row("e1", "zone_in", "Charges - Alerts (Congestion Charge Zone)", "congestion", "AB12 CDE", "KA", 35),
    row("e2", "overspeed", "Speed 52 mph in 30 zone", "other", "CD34 EFG", "TI", 80),
    row("e3", "overspeed", "Speed 49 mph in 30 zone", "other", "CD34 EFG", "TI", 82),
    row("e4", "zone_in", "Charges - Alerts (Blackwall Tunnel)", "tunnel", "EF56 GHJ", "RF", 140),
    row("e5", "ignition_off", "Ignition off", "other", "GH78 JKL", null, 400)
  ].filter(item => !store.dismissedAlerts.has(item.eventId));
}

function scenarios(kind: string): ScenarioItem[] {
  const item = (n: number, patch: Record<string, unknown>) => ({ id: `${kind}-${n}`, kind, timestamp: at(-(n % 3), 9 + n), jobId: EXPORT_JOBS[n * 3].id,
    clientName: EXPORT_JOBS[n * 3].customer || "Drew Sample", driverName: driverName(["KA", "TI", "RF"][n % 3]), driverInitials: ["KA", "TI", "RF"][n % 3],
    containerNumber: `CONT-${100 + n}`, address: `${n} Example Street, London`, damageCategories: n % 2 ? "Scuffed wall" : "Door frame, Floor",
    photos: n % 3 === 0 ? [] : [{ fileId: `p${n}`, thumbUrl: "" }], signature: n % 2 ? { fileId: `s${n}`, thumbUrl: "" } : null, ...patch }) as unknown as ScenarioItem;
  return [1, 2, 3, 4].map(n => item(n, {}));
}

/** Fictional placeholder photo (dev mock only). */
function mockPhoto(label: string, hue: number): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${hue},30%,86%)"/><text x="400" y="310" text-anchor="middle" font-family="Arial" font-size="40" fill="hsl(${hue},30%,30%)">${label} (sample)</text></svg>`)}`;
}

function vanDrivers(): VanDriverRecordItem[] {
  const iso = (days: number) => today().plus({ days }).toISODate()!;
  const record = (id: string, type: VanRecordItem["type"], reg: string, initials: string, days: number, patch: Partial<VanRecordItem>): VanRecordItem => ({
    id, type, submittedAt: at(days, 9), driverName: driverName(initials), driverEmail: "", driverInitials: initials, vanRegistration: reg, photoUrl: "", thumbUrl: "", ...patch });
  const van = (reg: string, initials: string, compliance: Partial<VanDriverRecordItem["compliance"]>, mileage: number): VanDriverRecordItem => {
    const records = [
      record(`${reg}-m`, "MILEAGE", reg, initials, -1, { mileage, odometerReading: mileage }),
      record(`${reg}-f`, "FUEL", reg, initials, -3, { fuelCost: 86.4, odometerReading: mileage - 120, photoUrl: mockPhoto("Fuel receipt", 35), thumbUrl: mockPhoto("Fuel receipt", 35) }),
      record(`${reg}-s`, "SERVICE", reg, initials, -90, { serviceMileage: mileage - 7600, serviceType: "Interim service", serviceDate: iso(-90), photoUrl: mockPhoto("Service sheet", 260), thumbUrl: mockPhoto("Service sheet", 260) })
    ];
    return { id: reg, driverName: driverName(initials), driverEmail: "", driverInitials: initials, vanRegistration: reg, latestSubmittedAt: records[0].submittedAt,
      latestMileage: records[0], latestFuel: records[1], latestService: records[2], records,
      compliance: { vanRegistration: reg, serviceIntervalMiles: 8000, lastServiceMileage: mileage - 7600, currentMileage: mileage, ...compliance } as VanDriverRecordItem["compliance"] };
  };
  return [
    van("AB12CDE", "KA", { motExpiryDate: iso(140), roadTaxRenewalDate: iso(60), insuranceExpiryDate: iso(200) }, 48210),
    van("CD34EFG", "TI", { motExpiryDate: iso(-4), roadTaxRenewalDate: iso(18), insuranceExpiryDate: iso(90) }, 61230),
    van("EF56GHJ", "RF", { motExpiryDate: undefined, roadTaxRenewalDate: iso(200), insuranceExpiryDate: undefined, serviceIntervalMiles: null }, 30110)
  ];
}

/** Per-driver figures for the selected range, computed from the same jobs the lists show. */
function driverSummary(from?: string | null, to?: string | null): DriverSummaryItem[] {
  const pounds = (items: NormalizedJob[]) => items.reduce((sum, item) => sum + (item.amountCharged || 0), 0) / 100;
  return DRIVERS.filter(driver => driver.active).map(driver => {
    const inRange = JOBS.filter(item => item.driverInitials === driver.initials && (!from || item.bookedStart >= from) && (!to || item.bookedStart <= to));
    const mine = inRange.filter(item => item.status === "COMPLETED");
    const final = pounds(mine);
    const single = (method: string) => pounds(mine.filter(item => item.paymentMethod === method));
    const timed = mine.filter(item => typeof item.actualMinutes === "number");
    const delays = mine.filter(item => item.arrivalDelaySource !== "unavailable").map(item => item.delayMinutes || 0);
    return { ...driver, hasAccount: true, assigned: inRange.length, completed: mine.length, cancelled: inRange.filter(item => item.status === "CANCELLED").length,
      completionRate: inRange.length ? Math.round(mine.length / inRange.length * 100) : 0, avgDurationMinutes: timed.length ? Math.round(timed.reduce((sum, item) => sum + (item.actualMinutes || 0), 0) / timed.length) : 0,
      totalDurationMinutes: Math.round(timed.reduce((sum, item) => sum + (item.actualMinutes || 0), 0)), workingUnknownJobs: mine.length - timed.length,
      avgDelayMinutes: delays.length ? delays.reduce((sum, value) => sum + value, 0) / delays.length : 0, totalChargesPounds: final, calculatedChargesPounds: mine.reduce((sum, item) => sum + (item.totalCharges || 0), 0) / 100,
      revenuePounds: final, revenueFormatted: `£${final.toFixed(2)}`, cashCollectedPounds: single("Cash"), cardCollectedPounds: single("Card"), linkCollectedPounds: single("Link"), bankCollectedPounds: single("Bank Transfer"),
      invoiceCollectedPounds: single("Invoice"), totalCollectionsPounds: single("Cash") + single("Card") + single("Link") + single("Bank Transfer"),
      unknownCollectionJobs: mine.filter(item => !item.paymentBreakdown?.length).length, congestionChargePounds: 0, tunnelChargePounds: 0, overtimeMinutes: 0, missingEvidenceCount: 0, overtimeCount: 0,
      reviewSentCount: Math.max(0, mine.length - 2), reviewNotSentCount: Math.min(2, mine.length) } as DriverSummaryItem;
  });
}

function summary(from?: string, to?: string) {
  const inRange = JOBS.filter(item => (!from || item.bookedStart >= from) && (!to || item.bookedStart <= to));
  const count = (status: string) => inRange.filter(item => item.status === status).length;
  const byDay = new Map<string, { revenuePounds: number; jobsCount: number }>();
  for (const item of inRange.filter(entry => entry.status === "COMPLETED")) {
    const day = DateTime.fromISO(item.bookedStart).setZone(zone).startOf("day").toUTC().toISO()!;
    const entry = byDay.get(day) ?? { revenuePounds: 0, jobsCount: 0 };
    entry.revenuePounds += (item.amountCharged || 0) / 100; entry.jobsCount += 1; byDay.set(day, entry);
  }
  const revenue = inRange.filter(item => item.status === "COMPLETED").reduce((sum, item) => sum + (item.amountCharged || 0), 0) / 100;
  return {
    kpis: { totalJobs: inRange.length, scheduled: count("READY"), inProgress: count("IN_PROGRESS"), completed: count("COMPLETED"), cancelled: count("CANCELLED"), late: 0, incomplete: 0,
      revenuePounds: revenue, revenueFormatted: `£${revenue.toFixed(2)}`, cashCollectedPounds: 0, cardBankPounds: 0, extraChargesPounds: 0, overtimePounds: 0, photosMissing: 0, photosProcessing: 0,
      photosFailed: 0, missingSignatures: 0, driversWorkingCount: 3, avgDurationMinutes: 130, avgDelayMinutes: 2 },
    charts: { statusBreakdown: [], revenueOverTime: Array.from(byDay.entries()).map(([date, value]) => ({ date, ...value })), paymentMethodSplit: [], jobsByDriver: [] },
    meta: { fetchedAt: new Date().toISOString(), durationMs: 12 }
  };
}

function listJobs(params: URLSearchParams) {
  const from = params.get("from"), to = params.get("to"), q = (params.get("q") || params.get("search") || "").toLowerCase();
  const status = params.get("status"), driver = params.get("driver");
  let rows = JOBS.filter(item => (!from || item.bookedStart >= from) && (!to || item.bookedStart <= to));
  if (status) rows = rows.filter(item => item.status === status);
  if (driver) rows = rows.filter(item => item.driverInitials === driver);
  if (q) rows = rows.filter(item => [item.jobId, item.customerName, item.pickup, item.dropoff].some(value => value.toLowerCase().includes(q)));
  const dir = params.get("dir") === "desc" ? -1 : 1;
  rows = [...rows].sort((a, b) => a.bookedStart.localeCompare(b.bookedStart) * dir);
  const page = Number(params.get("page") || 1), pageSize = Number(params.get("pageSize") || 25);
  const items = rows.slice((page - 1) * pageSize, page * pageSize);
  return { items, pagination: { page, pageSize, total: rows.length, totalPages: Math.ceil(rows.length / pageSize), hasMore: page * pageSize < rows.length }, meta: { fetchedAt: new Date().toISOString(), durationMs: 9 } };
}

/** Answers admin dashboard requests; null means "not an admin dashboard endpoint". */
export function handleAdmin(method: string, path: string, search: string, bodyText?: string): MockResponse | Promise<MockResponse> | null {
  const params = new URLSearchParams(search);
  if (path === "/api/admin/me" && method === "GET") return null; // session handled by handlers.ts
  const bookingOs = handleBooking(method, path, search, bodyText);
  if (bookingOs) return bookingOs;
  const activity = handleActivity(method, path, search, bodyText, JOBS);
  if (activity) return activity;
  if (path === "/api/admin/summary") return ok(summary(params.get("from") || undefined, params.get("to") || undefined));
  if (path === "/api/admin/jobs" && method === "GET") return ok(listJobs(params));
  // The server's CSV exports, answered from the same fictional data.
  if (path === "/api/admin/jobs/export.csv") {
    params.set("page", "1"); params.set("pageSize", "10000");
    const rows = listJobs(params).items.map(item => [item.jobId, item.bookedStart, item.customerName, item.pickup, item.dropoff, item.driverName, item.status, item.status === "COMPLETED" && typeof item.amountCharged === "number" ? (item.amountCharged / 100).toFixed(2) : ""]);
    return csvFile("tmv-jobs.csv", ["Job ID", "Booked start", "Customer", "Pickup", "Drop-off", "Driver", "Status", "Final charge (GBP)"], rows);
  }
  const scenarioExport = path.match(/^\/api\/admin\/scenarios\/([^/]+)\/export\.csv$/);
  if (scenarioExport) {
    const rows = scenarios(scenarioExport[1]).map(item => { const row = item as unknown as Record<string, string>; return [row.id, row.timestamp, row.jobId, row.clientName, row.driverName]; });
    return csvFile(`tmv-${scenarioExport[1]}.csv`, ["Record", "Submitted", "Job ID", "Client", "Driver"], rows);
  }
  // Create booking (Jobs > Add job). The real backend writes a Calendar event, and the job
  // only appears in Jobs after synchronization, so the preview accepts it without listing it.
  if (path === "/api/admin/jobs" && method === "POST") {
    const booking = parse(bodyText);
    const missing = ["customerName", "pickup", "dropoff", "start", "finish"].filter(key => !String(booking[key] ?? "").trim());
    if (missing.length) return { status: 400, body: { error: { code: "VALIDATION", message: `Missing: ${missing.join(", ")}` } } };
    return ok({ ok: true });
  }
  const jobMatch = path.match(/^\/api\/admin\/jobs\/([^/]+)(\/.*)?$/);
  if (jobMatch) {
    const id = decodeURIComponent(jobMatch[1]);
    const found = JOBS.find(item => item.jobId === id);
    if (!found) return notFound(`Job ${id} not found`);
    if (!jobMatch[2] && method === "GET") return ok({ job: found });
    if (jobMatch[2] === "/reassign" && method === "POST") {
      const { driverInitials } = parse(bodyText);
      JOBS = JOBS.map(item => item.jobId === id ? { ...item, driverInitials, driverName: driverName(driverInitials) } : item);
      return ok({ job: JOBS.find(item => item.jobId === id) });
    }
    return ok({ ok: true, job: found });
  }
  if (path === "/api/admin/drivers" && method === "GET") return ok({ drivers: DRIVERS.map(driver => ({ ...driver, role: "driver", hasPassword: driver.initials !== "RF", lastLoginAt: driver.active ? at(0, 7) : null })) });
  if (path === "/api/admin/drivers/summary") return ok({ drivers: driverSummary(params.get("from"), params.get("to")) });
  const report = path.match(/^\/api\/admin\/driver-reports\/([^/]+)$/);
  if (report) return sampleDriverReport(decodeURIComponent(report[1]), Object.fromEntries(params)).then(body => ok({ ...body, driver: { ...body.driver, initials: decodeURIComponent(report[1]), name: driverName(decodeURIComponent(report[1])) || body.driver.name, hasCurrentAccount: !!driverName(decodeURIComponent(report[1])) } }));
  if (path === "/api/admin/fleet/live") return ok({ vehicles: vehicles(), fetchedAt: new Date().toISOString() });
  if (path === "/api/admin/fleet/congestion-zones") return ok({ zones: [{ zoneId: 1, zoneName: "Congestion Charge Zone (sample outline)", vertices: [[51.523, -0.172], [51.525, -0.09], [51.508, -0.072], [51.491, -0.11], [51.497, -0.162]] }] });
  if (path === "/api/admin/fleet/congestion") return ok({ rows: [] });
  if (path === "/api/admin/notifications" && method === "GET") return ok({ rows: notifications() });
  if (path === "/api/admin/notifications/dismiss") { for (const id of parse(bodyText).jobIds ?? []) store.dismissedNotifications.add(id); return ok({ ok: true }); }
  if (path === "/api/admin/alerts" && method === "GET") return ok({ rows: alerts() });
  if (path === "/api/admin/alerts/dismiss") { for (const id of parse(bodyText).eventIds ?? []) store.dismissedAlerts.add(id); return ok({ ok: true }); }
  const scenario = path.match(/^\/api\/admin\/scenarios\/([^/]+)$/);
  if (scenario) { const from = params.get("from"), to = params.get("to"), driver = params.get("driver"); const items = scenarios(scenario[1]).filter(item => { const t = String((item as unknown as { timestamp: string }).timestamp); return (!from || t >= from) && (!to || t <= to) && (!driver || (item as unknown as { driverInitials?: string }).driverInitials === driver); }); return ok({ kind: scenario[1], items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1, hasMore: false } }); }
  if (path === "/api/admin/van/drivers") { const q = (params.get("q") || "").toLowerCase().replace(/\s+/g, ""); const items = vanDrivers().filter(item => !q || [item.vanRegistration, item.driverName, item.driverInitials].some(value => value.toLowerCase().replace(/\s+/g, "").includes(q))); return ok({ items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1, hasMore: false } }); }
  if (path.startsWith("/api/admin/van/compliance/") && method === "POST") return ok({ compliance: { vanRegistration: decodeURIComponent(path.split("/").pop()!), ...parse(bodyText) } });
  if (path === "/api/admin/messages" && method === "GET") return ok({ items: messages() });
  const toggle = path.match(/^\/api\/admin\/messages\/([^/]+)\/toggle$/);
  if (toggle) { store.messages = messages().map(item => item.id === toggle[1] ? { ...item, enabled: !!parse(bodyText).enabled } : item); return ok({ ok: true }); }
  const template = path.match(/^\/api\/admin\/messages\/([^/]+)$/);
  if (template && method === "POST") { store.messages = messages().map(item => item.id === template[1] ? { ...item, ...parse(bodyText) } : item); return ok({ ok: true }); }
  if (path === "/api/admin/settings" && method === "GET") return ok({ settings: SETTING_SPECS.map(spec => ({ ...spec, value: store.settings[spec.key] ?? "" })) });
  if (path === "/api/admin/settings" && method === "POST") {
    const { key, value } = parse(bodyText);
    store.settings[key] = String(value ?? "");
    return ok({ ok: true });
  }
  if (path.startsWith("/api/push/")) return { status: 503, body: { error: { code: "MOCK", message: "Push is not available in the mock API." } } };
  return null;
}
