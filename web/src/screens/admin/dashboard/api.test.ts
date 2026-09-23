import { afterEach, describe, expect, it, vi } from "vitest";
import { markJobFinishedManually } from "./api";

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
});
