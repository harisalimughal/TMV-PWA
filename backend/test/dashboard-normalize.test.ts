import { describe, expect, it, vi } from "vitest";
import { JobStatus } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

vi.mock("../src/auth/driver-account.service", () => ({
  listDriverProfiles: vi.fn().mockResolvedValue([])
}));

vi.mock("../src/db/settings.repo", () => ({
  getSetting: vi.fn((_: string, fallback: string) => Promise.resolve(fallback))
}));

import { normalizeMongoDataset } from "../src/admin/dashboard/normalize";

describe("normalizeMongoDataset", () => {
  it("preserves scenario photo and signature locations on document evidence items", async () => {
    const [job] = await normalizeMongoDataset({
      jobs: [{
        jobId: "TMV-LOC",
        calendarEventId: "cal-loc",
        driverInitials: "AB",
        customerName: "Client",
        customerEmail: "",
        customerPhone: "",
        pickup: "A",
        dropoff: "B",
        crewSize: 2,
        basePrice: 100,
        paidOnline: false,
        bookedStart: "2026-09-25T09:00:00.000Z",
        bookedFinish: "2026-09-25T11:00:00.000Z",
        actualStart: "",
        actualFinish: "",
        bookedMinutes: 120,
        actualMinutes: 0,
        differenceMinutes: 0,
        delayStatus: "Waiting",
        extraCharges: [],
        overtimeMinutes: 0,
        overtimeCharge: 0,
        totalCharges: 100,
        amountCharged: 0,
        paymentMethod: "",
        paymentStatus: "",
        clientNamePostcode: "",
        clientConfirmedBy: "",
        signatureUrl: "",
        driveFolderId: "",
        driveFolderUrl: "",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_LOADED_PHOTO,
        rawTitle: "",
        rawDescription: "",
        createdAt: "2026-09-25T08:00:00.000Z",
        updatedAt: "2026-09-25T08:00:00.000Z"
      } as any],
      evidence: [],
      activity: [],
      exceptions: [],
      scenarioSubmissions: [{
        jobId: "TMV-LOC",
        scenario: "parking",
        driver: "driver@example.com",
        fields: {},
        photoUrls: ["https://res.cloudinary.com/demo/image/upload/photo.jpg"],
        photoMeta: [{
          capturedAt: "2026-09-25T09:15:00.000Z",
          location: { lat: 51.5415459, lng: -0.0054064, accuracy: 5.78 },
          locationName: "Montfichet Road, Stratford"
        }],
        signatureUrl: "https://res.cloudinary.com/demo/image/upload/signature.png",
        signatureMeta: {
          capturedAt: "2026-09-25T09:16:00.000Z",
          location: { lat: 51.5415629, lng: -0.0054603, accuracy: 10.14 },
          locationName: "Montfichet Road, Stratford"
        },
        submittedAt: "2026-09-25T09:17:00.000Z"
      }],
      fetchedAt: "2026-09-25T09:18:00.000Z",
      durationMs: 0
    });

    const documents = job.evidenceItems.filter(item => item.category === "Documents");

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      fileName: "Parking Liability photo 1",
      capturedAt: "2026-09-25T09:15:00.000Z",
      location: { lat: 51.5415459, lng: -0.0054064, accuracy: 5.78 },
      locationName: "Montfichet Road, Stratford"
    });
    expect(documents[1]).toMatchObject({
      fileName: "Parking Liability signature",
      capturedAt: "2026-09-25T09:16:00.000Z",
      location: { lat: 51.5415629, lng: -0.0054603, accuracy: 10.14 },
      locationName: "Montfichet Road, Stratford"
    });
  });
});
