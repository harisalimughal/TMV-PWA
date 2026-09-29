import { describe, expect, it } from "vitest";
import { createAdminBroadcastPayload } from "../src/push/push.routes";

describe("admin broadcast push payload", () => {
  it("marks admin broadcasts so the driver app shows them as persistent popups", () => {
    expect(
      createAdminBroadcastPayload({
        title: "Traffic update",
        body: "Use the north entrance today.",
        url: "/?tab=jobs"
      })
    ).toEqual({
      title: "Traffic update",
      body: "Use the north entrance today.",
      url: "/?tab=jobs",
      data: { kind: "broadcast_message" }
    });
  });
});
