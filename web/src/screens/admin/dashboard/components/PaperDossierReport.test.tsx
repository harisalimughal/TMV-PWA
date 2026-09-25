import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobScenarioSection } from "./JobScenarioSection";
import { PaperDossierReport } from "./PaperDossierReport";
import type { JobScenarioSubmission, NormalizedJob } from "../types";

const checkinScenario: JobScenarioSubmission = {
  id: "scenario-1",
  kind: "checkin",
  timestamp: "2026-09-22T09:00:00.000Z",
  driver: "TI",
  clientName: "Tom Hostick",
  clientPhone: "07815695889",
  clientEmail: "hosticktom@gmail.com",
  containerNumber: "CONT-123",
  address: "",
  damageCategories: "",
  clientPresent: "Yes",
  rawRecord: {},
  photos: [
    {
      fileId: "scenario-photo-1",
      thumbUrl: "/scenario-photo.jpg",
      capturedAt: "2026-09-22T15:45:00.000Z",
      location: { lat: 51.49238, lng: -0.23211, accuracy: 12 },
      locationName: "2 Mercers Place, London"
    }
  ],
  signature: {
    fileId: "scenario-signature-1",
    thumbUrl: "/scenario-signature.jpg",
    capturedAt: "2026-09-22T15:47:00.000Z",
    location: { lat: 51.4924, lng: -0.2322, accuracy: 10 },
    locationName: "2 Mercers Place, London"
  }
};

const liabilityScenario: JobScenarioSubmission = {
  id: "scenario-liability",
  kind: "liability",
  timestamp: "2026-09-22T10:45:00.000Z",
  driver: "TI",
  clientName: "Tom Hostick",
  clientPhone: "07815695889",
  clientEmail: "hosticktom@gmail.com",
  containerNumber: "",
  address: "",
  damageCategories: "Wall mark",
  clientPresent: "Yes",
  rawRecord: {},
  photos: [
    {
      fileId: "liability-photo-1",
      thumbUrl: "/liability-photo.jpg",
      capturedAt: "2026-09-22T10:45:00.000Z",
      location: { lat: 51.5, lng: -0.12, accuracy: 14 },
      locationName: "Pickup address"
    }
  ],
  signature: null
};

const job = {
  jobId: "TMV-TEST123",
  calendarEventId: "calendar-1",
  bookedStart: "2026-09-22T10:00:00.000Z",
  bookedFinish: "2026-09-22T13:00:00.000Z",
  actualFinish: "2026-09-22T16:00:00.000Z",
  bookedMinutes: 180,
  delayMinutes: 0,
  delayBand: "ON_TIME",
  timingTrustworthy: true,
  customerName: "Tom Hostick",
  customerEmail: "hosticktom@gmail.com",
  customerPhone: "07815695889",
  pickup: "2 Mercers Place",
  dropoff: "Store First",
  crewSize: 2,
  driverInitials: "TI",
  driverName: "Tiago",
  status: "COMPLETED",
  currentState: "COMPLETED",
  workflowCompletionPct: 100,
  basePrice: 17500,
  extraChargeSelections: [],
  extraCharges: 0,
  congestionCharge: 0,
  tunnelCharge: 0,
  overtimeMinutes: 0,
  overtimeCharge: 0,
  calculatedTotalCharges: 17500,
  totalCharges: 17500,
  amountCharged: 17500,
  reconciled: true,
  paymentMethod: "Card",
  paymentStatus: "Paid",
  paidOnline: false,
  evidenceCompleteness: {
    arrival: "COMPLETED",
    vanLoaded: "MISSING",
    stopBy: "MISSING",
    emptyVan: "MISSING",
    organized: "MISSING",
    signature: "COMPLETED"
  },
  evidenceItems: [
    {
      id: "evidence-1",
      category: "Arrival",
      state: "COMPLETED",
      fileId: "arrival-file",
      thumbProxyUrl: "/arrival.jpg",
      provenance: "recorded",
      capturedAt: "2026-09-22T10:30:00.000Z",
      location: { lat: 51.5074, lng: -0.1278, accuracy: 20 },
      locationName: "London"
    }
  ],
  scenarios: [checkinScenario],
  rawTitle: "TMV test",
  rawDescription: "",
  bookingDetails: {},
  clientConfirmedName: "Tom Hostick",
  signatureUrl: "/signature.jpg",
  activity: [],
  exceptions: [],
  created: "2026-09-22T09:00:00.000Z",
  updated: "2026-09-22T16:00:00.000Z"
} satisfies NormalizedJob;

describe("JobScenarioSection", () => {
  it("shows captured timestamp and location below scenario photos and signatures", () => {
    render(<JobScenarioSection scenarios={[checkinScenario]} />);

    expect(screen.getByText(/22\/09\/26.*16:45/)).toBeInTheDocument();
    expect(screen.getAllByText("2 Mercers Place, London").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/22\/09\/26.*16:47/)).toBeInTheDocument();
  });
});

describe("PaperDossierReport", () => {
  it("prints evidence metadata and linked job scenario submissions", () => {
    render(<PaperDossierReport job={job} isPreview />);

    expect(screen.getByText(/22\/09\/26.*11:30.*London/)).toBeInTheDocument();
    expect(screen.getByText("Check In Evidence")).toBeInTheDocument();
    expect(screen.getByText("CONT-123")).toBeInTheDocument();
    expect(screen.getByText(/22\/09\/26.*16:45/)).toBeInTheDocument();
    expect(screen.getAllByText("2 Mercers Place, London").length).toBeGreaterThanOrEqual(1);
  });

  it("prints evidence and scenario submissions in the order the driver submitted them", () => {
    const jobWithMidFlowLiability: NormalizedJob = {
      ...job,
      evidenceItems: [
        job.evidenceItems[0],
        {
          id: "evidence-van-loaded",
          category: "VanLoaded",
          state: "COMPLETED",
          fileId: "van-loaded-file",
          thumbProxyUrl: "/van-loaded.jpg",
          provenance: "recorded",
          capturedAt: "2026-09-22T11:15:00.000Z",
          location: { lat: 51.51, lng: -0.13, accuracy: 16 },
          locationName: "Loaded address"
        }
      ],
      scenarios: [liabilityScenario]
    };

    render(<PaperDossierReport job={jobWithMidFlowLiability} isPreview />);

    const arrival = screen.getByText("Arrival");
    const liability = screen.getByText("Liability Report Evidence");
    const vanLoaded = screen.getByText("VanLoaded");

    expect(arrival.compareDocumentPosition(liability) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(liability.compareDocumentPosition(vanLoaded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
