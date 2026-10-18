import { describe, expect, it } from "vitest";
import { activityHref, composeTargetFrom, messageDriverHref } from "./activityLinks";

describe("activity links", () => {
  it("round-trips a driver and job through the composer URL", () => {
    expect(composeTargetFrom(messageDriverHref({ driver: "KA", jobId: "TMV-7 / x" }))).toEqual({ driver: "KA", jobId: "TMV-7 / x" });
  });
  it("is not a direct message without both a driver and a job, so it can never fall back to everyone", () => {
    expect(composeTargetFrom("?compose=driver&msgDriver=KA")).toBeNull();
    expect(composeTargetFrom("?compose=driver&msgJob=J1")).toBeNull();
    expect(composeTargetFrom("?msgDriver=KA&msgJob=J1")).toBeNull();
  });
  it("returns to the same conversation", () => {
    expect(activityHref("TMV-7")).toBe("?section=activity&conversation=TMV-7");
    expect(activityHref()).toBe("?section=activity");
  });
});
