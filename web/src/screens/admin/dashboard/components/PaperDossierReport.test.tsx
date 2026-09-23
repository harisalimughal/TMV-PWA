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
});
