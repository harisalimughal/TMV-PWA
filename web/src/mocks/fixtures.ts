/**
 * Sample data for the dev mock API (src/mocks/install.ts).
 *
 * DEV ONLY. This module is behind an `import.meta.env.DEV` guard at the single call
 * site and is tree-shaken out of `vite build`. Nothing here is imported by production
 * code.
 */
import type { ActivityEntry, Job } from "../api/jobs";
import type { DriverProfile } from "../api/auth";

export const mockDriver: DriverProfile = {
  email: "sam.driver@themanvan.co.uk",
  fullName: "Sam Driver",
  initials: "SD"
};

export const DEFAULT_CONFIRMATION_TEXT =
  "By signing below, you confirm that you have inspected the van, that it is empty, that all items have been " +
  "delivered, and that no items have been left behind. You also confirm that the removal service has been " +
  "completed to your satisfaction.";

function iso(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function makeJob(over: Partial<Job> & { jobId: string }): Job {
  const nowIso = new Date().toISOString();
  return {
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
}

export interface MockStore {
  loggedOut: boolean;
  driver: DriverProfile;
  jobs: Record<string, Job>;
  buckets: { today: string[]; past: string[]; next: string[] };
  activity: Record<string, ActivityEntry[]>;
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
    buckets: { today: ["10231", "10232"], past: ["10228"], next: ["10240"] },
    activity: {}
  };
}
