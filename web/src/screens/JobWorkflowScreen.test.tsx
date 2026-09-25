import { describe, expect, it } from "vitest";
import { photoMaxFor } from "./JobWorkflowScreen";

describe("photoMaxFor", () => {
  it("matches the driver workflow evidence photo limits", () => {
    expect(photoMaxFor("WAITING_LOADED_PHOTO")).toBe(5);
    expect(photoMaxFor("WAITING_STOP_BY_PHOTO")).toBe(5);
    expect(photoMaxFor("WAITING_EMPTY_VAN_PHOTO")).toBe(2);
  });
});
