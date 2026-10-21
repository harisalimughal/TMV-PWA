import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { JobScenarioSection } from "./JobScenarioSection";
import { JobDetailModal } from "./JobDetailModal";
import { PaperDossierReport, buildDossierPages } from "./PaperDossierReport";
import type { JobScenarioSubmission, NormalizedJob } from "../types";
import { vi } from "vitest";
import { paperJobSample } from "../../../../../test/reportPreview.sample";

describe("Formal dossier print consistency", () => {
  it("retains matching preview/print information, full job references and first-page branding", () => {
    const preview = render(<PaperDossierReport job={paperJobSample} isPreview />);
    const printable = render(<PaperDossierReport job={paperJobSample} />);
    expect(preview.container.textContent).toBe(printable.container.textContent);
    expect(preview.container.querySelector(".report-record-meta")).toHaveTextContent(paperJobSample.jobId);
    expect(preview.container.querySelectorAll(".report-heading img")).toHaveLength(1);
    // Summary page plus the packed evidence pages; every page is numbered.
    const total = buildDossierPages(paperJobSample).length + 1;
    expect(printable.container.querySelectorAll(".report-page-footer")).toHaveLength(total);
    expect(printable.container).toHaveTextContent(`Page ${total} of ${total}`);
  });
});

vi.mock("../../../../api/admin", () => ({
  fetchDrivers: vi.fn().mockResolvedValue([])
}));

vi.mock("../api", async importOriginal => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    reassignJob: vi.fn(),
    deleteEvidencePhoto: vi.fn(),
    markJobFinishedManually: vi.fn()
  };
});

const checkinScenario: JobScenarioSubmission = {
  id: "scenario-1",
  kind: "checkin",
  timestamp: "2026-09-22T09:00:00.000Z",
  driver: "TI",
  clientName: "Alex Sample",
  clientPhone: "07000000001",
  clientEmail: "alex.sample@example.test",
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
  clientName: "Alex Sample",
  clientPhone: "07000000001",
  clientEmail: "alex.sample@example.test",
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
  customerName: "Alex Sample",
  customerEmail: "alex.sample@example.test",
  customerPhone: "07000000001",
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
  clientConfirmedName: "Alex Sample",
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

  it("shows the checkpoint tag for job-linked scenario submissions", () => {
    render(<JobScenarioSection scenarios={[{
      ...checkinScenario,
      reportedAt: "Pickup — 2 Mercers Place",
      reportedAtPoint: "Pickup"
    }]} />);

    expect(screen.getByText("Pickup")).toBeInTheDocument();
  });
});

describe("PaperDossierReport", () => {
  it("uses one report title/contact header without repeating company branding and preserves report data", () => {
    const source = { ...job, pickup: "A full collection address with building and access details", dropoff: "A full delivery address with floor and entry details",
      scenarios: [checkinScenario, liabilityScenario] };
    const before = JSON.stringify(source);
    const { container } = render(<PaperDossierReport job={source} isPreview />);
    expect(screen.getAllByRole("heading", { name: "Job Report" })).toHaveLength(1);
    expect(screen.getAllByText("020 3773 9113")).toHaveLength(1);
    expect(screen.queryByText("THE MAN VAN")).not.toBeInTheDocument();
    expect(screen.getByText(source.pickup)).toBeInTheDocument(); expect(screen.getByText(source.dropoff)).toBeInTheDocument();
    expect(screen.getAllByText("£175.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Arrival" })).toHaveAttribute("src", "/arrival.jpg");
    expect(container.querySelectorAll(".report-preview-page")).toHaveLength(5);
    expect(container.querySelectorAll(".report-document-continuation")).toHaveLength(0);
    expect(JSON.stringify(source)).toBe(before);
  });
  it("prints evidence metadata and linked job scenario submissions", () => {
    render(<PaperDossierReport job={{
      ...job,
      scenarios: [{
        ...checkinScenario,
        reportedAt: "Pickup — 2 Mercers Place",
        reportedAtPoint: "Pickup"
      }]
    }} isPreview />);

    expect(screen.getAllByText(/22 Sep 2026, 11:30/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("heading", { name: /^Storage check-in/ })[0]).toHaveTextContent(/Storage check-in\s*·\s*Pickup/);
    expect(screen.getByText("CONT-123")).toBeInTheDocument();
    expect(screen.getByText("Reported at")).toBeInTheDocument();
    expect(screen.getByText("Pickup — 2 Mercers Place")).toBeInTheDocument();
    expect(screen.getAllByText(/22 Sep 2026, 16:45/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2 Mercers Place, London/).length).toBeGreaterThanOrEqual(1);
  });

  it("prints the driver's on-my-way timestamp in the job dossier preview", () => {
    render(<PaperDossierReport job={{
      ...job,
      onMyWayAt: "2026-09-22T09:45:00.000Z",
      clientSignatureAt: "2026-09-22T14:20:00.000Z",
      pickupArrivalAt: "2026-09-22T10:30:00.000Z",
      vanLoadedAt: "2026-09-22T10:48:00.000Z",
      actualFinish: "2026-09-22T16:00:00.000Z",
      trackerArrivalAt: "2026-09-22T10:12:00.000Z",
      arrivalProofDelayMinutes: 18,
      arrivalProofLate: true
    }} isPreview />);

    expect(screen.getByText("On my way")).toBeInTheDocument();
    expect(screen.getByText("22 Sep 2026, 10:45")).toBeInTheDocument();
    expect(screen.getByText("Customer signature time")).toBeInTheDocument();
    expect(screen.getAllByText(/22 Sep 2026, 15:20/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Proof of arrival photo time")).toBeInTheDocument();
    expect(screen.getByText("Van loaded photo time")).toBeInTheDocument();
    expect(screen.getByText("Empty van photo time")).toBeInTheDocument();
    expect(screen.getAllByText(/22 Sep 2026, 17:00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Gap between tracker arrival and proof photo: 18 min/)).toBeInTheDocument();
  });

  it("prints the adjustment reason when amount charged mismatches total charges", () => {
    render(<PaperDossierReport job={{
      ...job,
      totalCharges: 70600,
      amountCharged: 60000,
      reconciled: false,
      totalAdjustmentNote: "Customer agreed discount with office"
    }} isPreview />);

    expect(screen.getByText(/Adjustment reason: Customer agreed discount with office/)).toBeInTheDocument();
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
    const liability = screen.getAllByRole("heading", { name: /^Liability report/ })[0];
    const vanLoaded = screen.getByText("Van loaded");

    expect(arrival.compareDocumentPosition(liability) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(liability.compareDocumentPosition(vanLoaded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("JobDetailModal", () => {
  it("shows booked hire in the original booking description without restoring the removed details cards", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const { rerender } = render(<QueryClientProvider client={client}><JobDetailModal jobId={job.jobId} onClose={vi.fn()} initialJob={{ ...job, rawDescription: "Duration of Van Hire: 03 Hours and 30 Minutes", bookingDetails: { ...job.bookingDetails, hireDuration: "03 Hours and 30 Minutes" } }} /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Booking Description" })).toBeInTheDocument();
    expect(screen.getByLabelText("Original booking text")).toHaveTextContent("03 Hours and 30 Minutes");
    expect(screen.queryByText("Booked hire")).not.toBeInTheDocument();
    rerender(<QueryClientProvider client={client}><JobDetailModal jobId={`${job.jobId}-2`} onClose={vi.fn()} initialJob={{ ...job, jobId: `${job.jobId}-2`, bookingDetails: {} }} /></QueryClientProvider>);
    expect(screen.getByText("Not available for this job")).toBeInTheDocument();
  });


  it("shows each timeline step with its source, including the driver's On my way time", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    render(
      <QueryClientProvider client={client}>
        <JobDetailModal jobId={job.jobId} onClose={vi.fn()} initialJob={{
          ...job,
          onMyWayAt: "2026-09-22T09:45:00.000Z",
          clientSignatureAt: "2026-09-22T14:20:00.000Z",
          pickupArrivalAt: "2026-09-22T10:30:00.000Z",
          vanLoadedAt: "2026-09-22T10:48:00.000Z",
          trackerArrivalAt: "2026-09-22T10:12:00.000Z",
          arrivalProofDelayMinutes: 18,
          arrivalProofLate: true
        }} />
      </QueryClientProvider>
    );
    expect(screen.getByText("Driver marked On my way")).toBeInTheDocument();
    expect(screen.getByText("Tue 22 Sep, 10:45")).toBeInTheDocument();
    expect(screen.getAllByText("Customer signature").length).toBeGreaterThan(0);
    expect(screen.getByText("Tue 22 Sep, 15:20")).toBeInTheDocument();
    expect(screen.getAllByText("Proof of arrival photo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Van loaded photo").length).toBeGreaterThan(0);
    expect(screen.getByText("18 min after tracker arrival")).toBeInTheDocument();
    expect(screen.queryByText(/Customer notified/)).not.toBeInTheDocument();
  });
});
