import type { NormalizedJob } from "../src/screens/admin/dashboard/types";

const evidenceImage = (label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560"><rect width="900" height="560" fill="#e9eff3"/><rect x="36" y="36" width="828" height="488" rx="6" fill="#ffffff" stroke="#b7c7d2"/><path d="M36 190h828M36 370h828M310 36v488M590 36v488" stroke="#dde6ec"/><text x="450" y="265" text-anchor="middle" font-family="Arial" font-size="28" fill="#285e7c">${label}</text><text x="450" y="310" text-anchor="middle" font-family="Arial" font-size="18" fill="#6b7b86">Synthetic evidence fixture</text></svg>`)}`;
const signature = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><path d="M25 70 Q80 5 70 68 T160 45 Q170 90 190 25 Q210 55 245 45 L370 40" fill="none" stroke="#263640" stroke-width="3"/></svg>')}`;
export const paperScenarioSample = {
  id: "QA-SUBMISSION-001", jobId: "QA-JOB-001", timestamp: "2026-10-10T09:20:00Z", driver: "QA", driverName: "Sample Driver",
  clientName: "Sample Customer", clientPhone: "020 0000 0000", clientEmail: "customer@example.invalid", containerNumber: "CONTAINER-100",
  address: "10 Example Road, Building A, Third Floor, London E1 1AA", damageCategories: "Recorded item condition",
  rawRecord: { "Driver Name": "Sample Driver", "Driver": "QA" },
  photos: [1, 2].map(index => ({ fileId: `scenario-${index}`, thumbUrl: evidenceImage(`Scenario evidence ${index}`), capturedAt: `2026-10-10T09:2${index}:00Z`, location: { lat: 51.5, lng: -0.1, accuracy: 5 }, locationName: "Example Road, London" })),
  signature: { url: signature, thumbUrl: signature, capturedAt: "2026-10-10T09:25:00Z" }
};
export const paperJobSample: NormalizedJob = {
  jobId: "QA-JOB-001", calendarEventId: "synthetic-calendar", bookedStart: "2026-10-10T09:00:00Z", bookedFinish: "2026-10-10T10:30:00Z",
  actualStart: "2026-10-10T09:00:00Z", actualFinish: "2026-10-10T11:30:00Z", bookedMinutes: 90, actualMinutes: 150,
  delayMinutes: 0, delayBand: "ON_TIME", timingTrustworthy: true, customerName: "Sample Customer", customerEmail: "customer@example.invalid", customerPhone: "020 0000 0000",
  pickup: "10 Example Road, Building A, Third Floor, London E1 1AA", dropoff: "25 Example Avenue, Reception Entrance, Second Floor, London SE1 2BB",
  crewSize: 2, driverInitials: "QA", driverName: "Sample Driver", status: "COMPLETED", currentState: "COMPLETED", workflowCompletionPct: 100,
  basePrice: 20000, extraChargeSelections: ["London Congestion charge", "Tunnel Charges"], extraCharges: 3160, congestionCharge: 1800, tunnelCharge: 1360,
  overtimeMinutes: 30, overtimeCharge: 5500, calculatedTotalCharges: 28660, totalCharges: 28660, amountCharged: 25000, reconciled: false, totalAdjustmentNote: "Agreed office adjustment",
  paymentMethod: "Card", paymentStatus: "Paid", paidOnline: false, onMyWayAt: "2026-10-10T08:30:00Z", trackerArrivalAt: "2026-10-10T08:58:00Z", pickupArrivalAt: "2026-10-10T09:00:00Z", vanLoadedAt: "2026-10-10T09:10:00Z", clientSignatureAt: "2026-10-10T11:35:00Z",
  evidenceCompleteness: { arrival: "COMPLETED", vanLoaded: "COMPLETED", stopBy: "MISSING", emptyVan: "COMPLETED", organized: "COMPLETED", signature: "COMPLETED" },
  evidenceItems: (["Arrival", "VanLoaded", "EmptyVan", "Organized"] as const).map((category, index) => ({ id: `evidence-${index}`, category, state: "COMPLETED", fileId: `evidence-${index}`,
    thumbProxyUrl: evidenceImage(category), provenance: "recorded", capturedAt: ["2026-10-10T09:00:00Z", "2026-10-10T09:10:00Z", "2026-10-10T11:30:00Z", "2026-10-10T11:40:00Z"][index], location: { lat: 51.5, lng: -0.1, accuracy: 5 }, locationName: "Example Road, London" })),
  scenarios: [{ ...paperScenarioSample, kind: "parking", clientPresent: "Yes", signature: { ...paperScenarioSample.signature, fileId: "signature", thumbUrl: signature } }],
  clientConfirmedName: "Sample Customer", signatureUrl: signature, rawTitle: "Synthetic booking", rawDescription: "Example booking details", bookingDetails: {}, activity: [], exceptions: [],
  created: "2026-10-10T08:00:00Z", updated: "2026-10-10T11:40:00Z"
};
