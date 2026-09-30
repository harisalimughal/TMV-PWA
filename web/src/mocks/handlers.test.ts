import { beforeEach, describe, expect, it } from "vitest";
import { handle, resetStore } from "./handlers";
import type { JobUpdateResult } from "../api/jobs";

describe("mock job handlers", () => {
  beforeEach(() => {
    resetStore();
  });

  it("handles the on-my-way job action without advancing workflow state", () => {
    const res = handle("POST", "/api/jobs/10231/on-my-way");

    expect(res?.status).toBe(200);
    const body = res?.body as JobUpdateResult;
    expect(body.job.jobId).toBe("10231");
    expect(body.job.onMyWayAt).toEqual(expect.any(String));
    expect(body.job.status).toBe("READY");
    expect(body.job.currentState).toBe("READY");
  });
});
