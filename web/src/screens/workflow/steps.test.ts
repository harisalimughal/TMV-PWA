import { describe, expect, it } from "vitest";
import { STEPS } from "./steps";

describe("driver workflow step order", () => {
  it("puts empty van photo and customer sign-off before checkout and charges", () => {
    const sequence = [
      "WAITING_EMPTY_VAN_ISSUES_CHECK",
      "WAITING_EMPTY_VAN_PHOTO",
      "WAITING_CLIENT_CONFIRMATION",
      "WAITING_EXTRA_CHARGES",
      "WAITING_OVERTIME",
      "WAITING_TOTAL_CHARGES",
      "WAITING_PAYMENT",
      "WAITING_REVIEW_CHECK"
    ];

    expect(sequence.map(state => STEPS[state].order)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("uses the new home-screen action labels for arrival and loaded proof", () => {
    expect(STEPS.WAITING_ARRIVAL_PHOTO.shortLabel).toBe("Proof of Arrival");
    expect(STEPS.WAITING_LOADED_PHOTO.shortLabel).toBe("Load Finished (Take Picture)");
  });
});
