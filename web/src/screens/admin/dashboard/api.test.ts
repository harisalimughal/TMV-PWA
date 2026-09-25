import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchScenarios, markJobFinishedManually } from "./api";

describe("dashboard api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the manual finish note to the job override endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, job: { jobId: "TMV-123" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await markJobFinishedManually("TMV-123", "Completed manually outside app");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/jobs/TMV-123/finish-manually",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Completed manually outside app" })
      })
    );
  });

  it("passes scenario date filters to the dashboard API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ kind: "checkin", items: [], pagination: { page: 2, pageSize: 25, total: 0, totalPages: 0, hasMore: false } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScenarios("checkin", 2, "TI", "2026-09-24T00:00:00.000Z", "2026-09-24T23:59:59.999Z");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/scenarios/checkin?page=2&driver=TI&from=2026-09-24T00%3A00%3A00.000Z&to=2026-09-24T23%3A59%3A59.999Z",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });
});
