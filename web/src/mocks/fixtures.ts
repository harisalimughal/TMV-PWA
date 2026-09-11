/**
 * Sample data for the dev mock API (src/mocks/install.ts).
 *
 * DEV ONLY. This module is behind an `import.meta.env.DEV` guard at the single call
 * site and is tree-shaken out of `vite build`. Nothing here is imported by production
 * code.
 */
import type { ActivityEntry, EvidenceItem, Job } from "../api/jobs";
import type { DriverProfile } from "../api/auth";

export const mockDriver: DriverProfile = {
  email: "sam.driver@themanvan.co.uk",
  fullName: "Sam Driver",
  initials: "SD"
};

export const DEFAULT_CONFIRMATION_TEXT =
  "I confirm that the moving service has been completed and all my belongings have been unloaded. " +
  "I have checked the van and confirm that nothing has been left behind. By signing, I agree that the job " +
  "is complete and the team is released to leave. Any request to return after sign-off will be subject to " +
  "availability and additional charges.";

function iso(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** The verbatim Calendar event title ops type for a booking, in the shape
 *  backend/src/jobs/booking.service.ts parses: "<crew> Men - £<price> - <HH:mm> /
 *  <Y|N> - <initials>". The tag is always "Y" here: the backend never syncs an
 *  unconfirmed ("/ N") or untagged event into a Job (see parseCalendarEvent), so
 *  every job the app ever sees is confirmed. The card drops the "/ …" tag anyway. */
function mockRawTitle(job: Pick<Job, "crewSize" | "basePrice" | "bookedStart">): string {
  const time = new Date(job.bookedStart).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  });
  return `${job.crewSize} Men - £${job.basePrice} - ${time} / Y - ${mockDriver.initials}`;
}

export function makeJob(over: Partial<Job> & { jobId: string }): Job {
  const nowIso = new Date().toISOString();
  const job: Job = {
    calendarEventId: `cal_${over.jobId}`,
    driverInitials: mockDriver.initials,
    customerName: "Sample Customer",
    customerEmail: "customer@example.com",
    customerPhone: "+44 7700 900123",
    pickup: "12 Maple Street, London SW1A 1AA",
    dropoff: "48 Oak Avenue, Reading RG1 2AB",
    crewSize: 2,
    basePrice: 320,
    paidOnline: false,
    // Booking-form extras — on real jobs these are parsed from the Calendar event
    // description (backend). Seeded here so the job-detail card shows a full,
    // realistic set of rows in dev. Override per job in seedStore() where it matters.
    vanSize: "Medium - Transit Van",
    hireDurationText: "04 Hours",
    floorFrom: "No stairs, ground floor",
    floorTo: "01 flight of stairs",
    extraChargeText: "£55 per half an hour",
    extraRequest: "I don't need any extras",
    inventory:
      '55" TV and bracket stand / large bookcase / small display case / nest of tables / ' +
      "chest of drawers / recliner chair / 50 medium boxes approximately",
    bookedStart: iso(0, 9),
    bookedFinish: iso(0, 12),
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 180,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "ON_TIME",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 0,
    paymentMethod: "",
    paymentStatus: "UNPAID",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    status: "READY",
    currentState: "READY",
    createdAt: nowIso,
    updatedAt: nowIso,
    ...over
  };
  return { ...job, rawTitle: over.rawTitle ?? mockRawTitle(job) };
}

export interface MockStore {
  loggedOut: boolean;
  driver: DriverProfile;
  jobs: Record<string, Job>;
  buckets: { today: string[]; past: string[]; next: string[] };
  activity: Record<string, ActivityEntry[]>;
  settings: Record<string, string>;
  /** Photos "uploaded" per job — so stepping back to a photo step shows them and
   *  delete/add actually change something in dev. */
  evidence: Record<string, EvidenceItem[]>;
}

let mockEvidenceSeq = 0;
export function makeEvidenceItem(evidenceType: string): EvidenceItem {
  mockEvidenceSeq += 1;
  return {
    evidenceId: `EV-MOCK-${mockEvidenceSeq}`,
    evidenceType,
    url: `https://picsum.photos/seed/tmv-${evidenceType}-${mockEvidenceSeq}/500/500`,
    // Sample capture location/time so the driver's "small text under photos" caption
    // and the admin thumbnail caption both have something real to show in dev.
    // Somewhere around Findhorn Street E14, jittered a little per photo.
    capturedAt: iso(0, 8, 30 + mockEvidenceSeq),
    location: { lat: 51.5074 + mockEvidenceSeq * 0.0003, lng: -0.0089 - mockEvidenceSeq * 0.0003, accuracy: 12 }
  };
}

/** Fresh store — call to reset dev state (e.g. on HMR of this module). */
export function seedStore(): MockStore {
  const jobs: Job[] = [
    makeJob({
      jobId: "10231",
      customerName: "Priya Shah",
      customerPhone: "+44 7700 900201",
      pickup: "7 Larch Close, London N1 7DP",
      dropoff: "22 Bridge Road, St Albans AL1 3RX",
      crewSize: 2,
      basePrice: 285,
      bookedStart: iso(0, 8, 30),
      bookedFinish: iso(0, 11, 30),
      status: "READY",
      currentState: "READY"
    }),
    makeJob({
      jobId: "10232",
      customerName: "Tom Fletcher",
      customerPhone: "+44 7700 900202",
      pickup: "The Wharf, 1 Dock Street, London E1 8AL",
      dropoff: "5 Kingfisher Way, Slough SL2 5GH",
      crewSize: 3,
      basePrice: 540,
      paidOnline: true,
      bookedStart: iso(0, 13, 30),
      bookedFinish: iso(0, 17, 0),
      actualStart: iso(0, 13, 41),
      status: "IN_PROGRESS",
      currentState: "WAITING_LOADED_PHOTO"
    }),
    makeJob({
      jobId: "10228",
      customerName: "Grace Owusu",
      customerPhone: "+44 7700 900203",
      pickup: "40 Elm Grove, London SE15 5DE",
      dropoff: "12 Sherwood Rise, Nottingham NG5 1AA",
      crewSize: 2,
      basePrice: 300,
      bookedStart: iso(-1, 10, 0),
      bookedFinish: iso(-1, 13, 30),
      actualStart: iso(-1, 10, 12),
      status: "IN_PROGRESS",
      currentState: "WAITING_ARRIVAL_PHOTO"
    }),
    makeJob({
      jobId: "10240",
      customerName: "Daniel Reed",
      customerPhone: "+44 7700 900204",
      pickup: "3 Priory Court, Bristol BS1 6QT",
      dropoff: "88 Cathedral Road, Cardiff CF11 9LL",
      crewSize: 2,
      basePrice: 265,
      bookedStart: iso(2, 8, 0),
      bookedFinish: iso(2, 11, 0),
      status: "READY",
      currentState: "READY"
    }),
    makeJob({
      jobId: "10238",
      customerName: "Aisha Khan",
      customerPhone: "+44 7700 900205",
      pickup: "14 Canal Street, Manchester M1 3HE",
      dropoff: "9 Vernon Road, Leeds LS6 1AA",
      crewSize: 2,
      basePrice: 310,
      bookedStart: iso(1, 9, 0),
      bookedFinish: iso(1, 12, 30),
      status: "READY",
      currentState: "READY"
    }),
    makeJob({
      jobId: "10245",
      customerName: "Marco Rossi",
      customerPhone: "+44 7700 900206",
      pickup: "2 Harbour View, Brighton BN1 1AA",
      dropoff: "31 Millers Way, Oxford OX1 2AB",
      crewSize: 3,
      basePrice: 480,
      bookedStart: iso(3, 14, 0),
      bookedFinish: iso(3, 18, 0),
      status: "READY",
      currentState: "READY"
    })
  ];

  const byId: Record<string, Job> = {};
  for (const j of jobs) byId[j.jobId] = j;

  return {
    // `?mock=loggedout` starts the app on the sign-in screen (handy for previewing auth).
    loggedOut:
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mock") === "loggedout",
    driver: mockDriver,
    jobs: byId,
    buckets: {
      today: ["10231", "10232"],
      past: ["10228"],
      next: ["10238", "10240", "10245"]
    },
    activity: {},
    settings: {},
    // 10232 is mid-flow (WAITING_LOADED_PHOTO), so it already has arrival photos — step
    // back to the arrival step in dev to see them, delete one, add another.
    evidence: {
      "10232": [makeEvidenceItem("Arrival"), makeEvidenceItem("Arrival")]
    }
  };
}
