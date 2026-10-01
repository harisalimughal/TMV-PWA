import { describe, expect, it } from "vitest";
import {
  customerSignatureBlockedReason,
  paymentActionInput,
  paymentBlockedReasonFor,
  paymentMethodTakesAmount,
  photoMaxFor
} from "./JobWorkflowScreen";

describe("photoMaxFor", () => {
  it("matches the driver workflow evidence photo limits", () => {
    expect(photoMaxFor("WAITING_LOADED_PHOTO")).toBe(5);
    expect(photoMaxFor("WAITING_EMPTY_VAN_PHOTO")).toBe(2);
  });
});

describe("payment helpers", () => {
  it("requires amounts for selected paid methods but not invoice", () => {
    expect(paymentMethodTakesAmount("Card")).toBe(true);
    expect(paymentMethodTakesAmount("Cash")).toBe(true);
    expect(paymentMethodTakesAmount("Invoice")).toBe(false);
  });

  it("builds the workflow action payload without an invoice amount field", () => {
    const input = paymentActionInput(["Card", "Invoice"], { Card: "85", Invoice: "999" });

    expect(input).toEqual({
      payment_method: ["Card", "Invoice"],
      payment_amount_Card: ["85"]
    });
  });

  it("blocks continuing when a selected paid method has no valid amount", () => {
    expect(paymentBlockedReasonFor(["Invoice"], {})).toBeUndefined();
    expect(paymentBlockedReasonFor(["Card", "Invoice"], { Card: "" })).toBe("Enter the amount taken by Card.");
    expect(paymentBlockedReasonFor(["Card"], { Card: "-5" })).toBe("Enter a valid amount taken by Card.");
  });
});

describe("customer signature helper", () => {
  it("requires saving a signature before the customer sign-off can continue", () => {
    expect(customerSignatureBlockedReason(false)).toBe("The customer needs to sign first.");
    expect(customerSignatureBlockedReason(true)).toBeUndefined();
    expect(customerSignatureBlockedReason(true, "You're offline.")).toBe("You're offline.");
  });
});
