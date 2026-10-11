import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, DriverProfile } from "../src/jobs/job.types";
const mocks = vi.hoisted(() => ({ jobForDriver: vi.fn(), insert: vi.fn(), upload: vi.fn(), activity: vi.fn() }));
vi.mock("../src/jobs/jobs.service", () => ({ getJobForDriver: mocks.jobForDriver, resolveDriver: vi.fn(), saveJob: vi.fn() }));
vi.mock("../src/jobs/evidence.service", () => ({ looksLikeImage: () => true }));
vi.mock("../src/db/scenario.repo", () => ({ insertScenarioSubmission: mocks.insert }));
vi.mock("../src/storage/cloudinary", () => ({ uploadEvidenceImage: mocks.upload }));
vi.mock("../src/db/activity.repo", () => ({ appendActivity: mocks.activity }));
vi.mock("../src/integrations/geocode", () => ({ reverseGeocode: vi.fn() }));
import { submitScenario } from "../src/jobs/scenario.service";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.jobForDriver.mockResolvedValue({ job: { jobId: "JOB", currentState: "WAITING_ARRIVAL_PHOTO", gpsliveImei: "123" } as Job,
    driver: { initials: "AB", fullName: "Original Driver", email: "ab@example.com", imei: "profile-van" } as DriverProfile });
  mocks.insert.mockResolvedValue(undefined); mocks.activity.mockResolvedValue(undefined); mocks.upload.mockResolvedValue({ url: "https://example.test/evidence" });
});
describe("Existing liability form boundaries", () => {
  it("captures authenticated historical identity and never accepts monetary/approval metadata from driver fields", async () => {
    const image = { buffer: Buffer.from("image"), contentType: "image/jpeg" };
    const result = await submitScenario("parking", "JOB", "ab@example.com", { client_name: "Customer", amountPence: "99999", liabilityFinancial: '{"origin":"approved-import"}', driverSnapshot: '{"initials":"OTHER"}' }, [image], image);
    expect(result.submission.driverSnapshot).toEqual({ initials: "AB", fullName: "Original Driver", email: "ab@example.com", imei: "123" });
    expect(result.submission.liabilityFinancial).toBeUndefined();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it("keeps liability scenario photos/signatures and categories in the existing workflow", async () => {
    const image = { buffer: Buffer.from("image"), contentType: "image/jpeg", locationName: "Pickup" };
    const result = await submitScenario("liability", "JOB", "ab@example.com", { damage_categories: "Walls | Van Overloaded", reported_at: "Pickup" }, [image], image);
    expect(result.submission.photoUrls).toEqual(["https://example.test/evidence"]);
    expect(result.submission.signatureUrl).toBe("https://example.test/evidence");
    expect(result.submission.fields.damage_categories).toBe("Walls | Van Overloaded");
  });
});
