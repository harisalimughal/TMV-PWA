/**
 * Dev mock data for the driver-app routes that aren't part of the job workflow:
 * pending submissions, van compliance + record uploads, reverse geocoding and the
 * push-subscription endpoints. DEV ONLY (imported from handlers.ts, excluded from
 * `vite build`). Dates are relative to today so the Van screen always shows a mix
 * of statuses.
 */
import type { MockResponse } from "./handlers";
import type { PendingSubmissionJob, ScenarioSubmission } from "../api/jobs";
import type { VanCompliance, VanRecord, VanRecordType } from "../api/van";

const ok = (body: unknown): MockResponse => ({ status: 200, body });

const DAY_MS = 24 * 60 * 60 * 1000;
const dateIn = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const isoAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

interface DriverRecordsStore {
  pending: PendingSubmissionJob[];
  /** Liability-tab submissions, by job id. */
  scenarios: Record<string, ScenarioSubmission[]>;
  compliance: VanCompliance;
  records: VanRecord[];
}

function seed(): DriverRecordsStore {
  return {
    pending: [
      { jobId: "10198", customerName: "Harriet Cole", bookedStart: isoAgo(30), actualFinish: isoAgo(26), requiredAt: isoAgo(2) },
      { jobId: "10204", customerName: "Marcus Webb", bookedStart: isoAgo(52), actualFinish: isoAgo(49), requiredAt: isoAgo(24) }
    ],
    compliance: {
      vanRegistration: "LK21 TMV",
      roadTaxRenewalDate: dateIn(94),
      motExpiryDate: dateIn(12),
      insuranceExpiryDate: dateIn(-3),
      serviceIntervalMiles: 8000,
      lastServiceMileage: 41200,
      currentMileage: 47950,
      updatedAt: isoAgo(72)
    },
    records: [],
    scenarios: {
      "10231": [
        {
          id: "mock-sc-1",
          jobId: "10231",
          scenario: "parking",
          fields: { reported_at: "Pickup — 7 Larch Close, London N1 7DP", client_name: "Priya Shah" },
          photoUrls: [mockPhoto("Red route", 8), mockPhoto("Bay sign", 30)],
          submittedAt: isoAgo(1.5)
        },
        {
          id: "mock-sc-2",
          jobId: "10231",
          scenario: "liability",
          fields: { reported_at: "Pickup — 7 Larch Close, London N1 7DP", damage_categories: "Scratched furniture, Unprotected items" },
          photoUrls: [mockPhoto("Wardrobe", 210), mockPhoto("Table edge", 190), mockPhoto("Mirror", 160)],
          signatureUrl: mockPhoto("Signature", 0),
          submittedAt: isoAgo(1)
        }
      ]
    }
  };
}

function mockPhoto(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue},35%,86%)"/><text x="200" y="160" font-family="sans-serif" font-size="28" text-anchor="middle" fill="hsl(${hue},30%,32%)">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Called by handlers.ts when a scenario form is submitted, so the Liability tab's
 *  "Recorded on this job" list shows it. Multipart bodies aren't visible to the mock,
 *  so the record carries only what the path tells us. */
export function recordMockScenario(jobId: string, scenario: string, fields: Record<string, string> = {}): void {
  const list = (store.scenarios[jobId] ??= []);
  list.push({
    id: `mock-sc-${Date.now()}`,
    jobId,
    scenario,
    fields,
    photoUrls: [mockPhoto(scenario, 200)],
    submittedAt: new Date().toISOString()
  });
}

let store = seed();

export function resetDriverRecords(): void {
  store = seed();
}

function addRecord(type: VanRecordType, extra: Partial<VanRecord>): MockResponse {
  const record: VanRecord = {
    _id: `mock-van-${store.records.length + 1}`,
    type,
    driverEmail: "caio@example.test",
    driverName: "Caio",
    driverInitials: "KA",
    vanRegistration: store.compliance.vanRegistration,
    photoUrl: "",
    submittedAt: new Date().toISOString(),
    ...extra
  };
  store.records.unshift(record);
  // Multipart bodies aren't visible to the mock, so nudge the odometer forward
  // to show the gauge reacting to a new reading.
  store.compliance = { ...store.compliance, currentMileage: (store.compliance.currentMileage ?? 0) + 25, updatedAt: record.submittedAt };
  if (type === "SERVICE") store.compliance = { ...store.compliance, lastServiceMileage: store.compliance.currentMileage };
  return ok({ record });
}

/** Returns a response for driver-only routes, or null to fall through. */
export function handleDriverRecords(method: string, path: string, search: URLSearchParams): MockResponse | null {
  if (path === "/api/jobs/pending-submissions" && method === "GET") return ok({ jobs: store.pending });
  if (/^\/api\/jobs\/[^/]+\/viewed$/.test(path) && method === "POST") return ok({ ok: true });
  // Liability tab history (seeded for the in-progress mock job; new submissions are
  // appended via recordMockScenario from handlers.ts).
  const scenariosGet = path.match(/^\/api\/jobs\/([^/]+)\/scenarios$/);
  if (scenariosGet && method === "GET") return ok({ submissions: store.scenarios[decodeURIComponent(scenariosGet[1])] ?? [] });
  if (path === "/api/jobs/geocode/reverse" && method === "GET") {
    const lat = Number(search.get("lat"));
    return ok({ locationName: Number.isFinite(lat) && lat !== 0 ? "Camden, London" : null });
  }

  if (path === "/api/van/compliance" && method === "GET") return ok({ compliance: store.compliance });
  if (path === "/api/van/mileage" && method === "POST") return addRecord("MILEAGE", { mileage: (store.compliance.currentMileage ?? 0) + 25 });
  if (path === "/api/van/fuel" && method === "POST") return addRecord("FUEL", { odometerReading: (store.compliance.currentMileage ?? 0) + 25, fuelCost: 72.4 });
  if (path === "/api/van/service" && method === "POST") return addRecord("SERVICE", { serviceMileage: store.compliance.currentMileage ?? 0, serviceType: "Full service", serviceDate: dateIn(0) });

  // Push needs a real service worker, which dev doesn't register. A null key makes
  // the subscribe flow bail out cleanly instead of waiting on `serviceWorker.ready`.
  if (path === "/api/push/vapid-public-key" && method === "GET") return ok({ publicKey: null });
  if (/^\/api\/push\/(subscribe|unsubscribe|test)$/.test(path) && method === "POST") return ok({ ok: true });

  return null;
}

/** Test/QA helper: clears the pending list so the empty state can be checked. */
export function clearPendingSubmissions(): void {
  store.pending = [];
}
