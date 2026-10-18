import { describe, expect, it } from "vitest";
import { DOCUMENT_TEMPLATES, conditionalNoticeApplies, templateFor, storedDeclaration, wordingProvenance } from "./documentTemplates";

// The approved wording, written out in full. A change to src/scenarioSpec.ts that alters
// a single character fails here, so wording can only change on purpose, with this file.
const APPROVED = {
  checkin: "By signing this document, you confirm that, All items listed have been checked in and stored.",
  checkout: "By signing this document, you confirm that: All items stored with us have been returned in good condition. You have checked and received all items listed. We hold no further responsibility or liability for these items after receipt.",
  parkingTitle: "Penalty Charge Liability Notice",
  parking: "(PCN) In the event a fine is received, You will cover the cost directly, ensuring the company and drivers are not held liable. (Penalty Charge Notice) fines typically start at £60 and can go up to £180, depending on the severity of the offence. If paid within 14 days, most fines are reduced by 50%, making the lowest payable amount £45 and the highest £90.",
  liability: "By signing, you assume all liability for any damage to the items shown in the pictures and on the list, as explained by the driver. The driver cannot take liability for items not properly packed or protected, and such items or place are not covered by our insurance.",
  waiverTitle: "Overloading Liability Waiver",
  waiver: "By signing, you acknowledge that the driver has explained the need for two vans or multiple trips for safety and weight legal compliance. You assume full liability for any overloading fines and damage for the items loaded and additional costs, including extra van hire if required. The company and driver are not responsible for any penalties or delays caused by exceeding the legal weight limit."
};

describe("document templates", () => {
  it("gives each scenario its own stable id", () => {
    expect(Object.values(DOCUMENT_TEMPLATES).map(template => template.id)).toEqual(["liability_check_in", "liability_check_out", "parking_liability", "liability_report"]);
    expect(templateFor("unknown")).toBeNull();
  });

  it("keeps the approved wording for each scenario exactly", () => {
    expect(DOCUMENT_TEMPLATES.checkin.declaration).toBe(APPROVED.checkin);
    expect(DOCUMENT_TEMPLATES.checkout.declaration).toBe(APPROVED.checkout);
    expect(DOCUMENT_TEMPLATES.parking.notice).toEqual({ title: APPROVED.parkingTitle, text: APPROVED.parking });
    expect(DOCUMENT_TEMPLATES.liability.declaration).toBe(APPROVED.liability);
    expect(DOCUMENT_TEMPLATES.liability.conditionalNotice).toMatchObject({ title: APPROVED.waiverTitle, text: APPROVED.waiver, whenValue: "Van Overloaded" });
  });

  it("never mixes wording between scenarios", () => {
    expect(DOCUMENT_TEMPLATES.parking.declaration).toBeUndefined();
    expect(DOCUMENT_TEMPLATES.checkin.notice).toBeUndefined();
    expect(DOCUMENT_TEMPLATES.checkout.notice).toBeUndefined();
    expect(DOCUMENT_TEMPLATES.checkin.conditionalNotice).toBeUndefined();
    expect(DOCUMENT_TEMPLATES.parking.conditionalNotice).toBeUndefined();
  });

  it("applies the overloading waiver only when that category was recorded", () => {
    expect(conditionalNoticeApplies(DOCUMENT_TEMPLATES.liability, "Walls | Van Overloaded")).toBe(true);
    expect(conditionalNoticeApplies(DOCUMENT_TEMPLATES.liability, "Walls, Floor")).toBe(false);
    expect(conditionalNoticeApplies(DOCUMENT_TEMPLATES.liability, "Van Overloaded (partly)")).toBe(false);
    expect(conditionalNoticeApplies(DOCUMENT_TEMPLATES.liability, undefined)).toBe(false);
  });
});

describe("signed wording provenance", () => {
  it("uses the wording stored with the record when present", () => {
    const snapshot = storedDeclaration({ declarationSnapshot: { templateId: "liability_check_in", version: 3, text: "Signed text" } });
    expect(snapshot?.text).toBe("Signed text");
    expect(wordingProvenance(templateFor("checkin"), "checkin", snapshot)).toBe("Wording: as stored with the record at signing (template liability_check_in v3).");
  });
  it("never presents the current template as the signed original", () => {
    expect(storedDeclaration({})).toBeNull();
    expect(storedDeclaration({ declarationSnapshot: { text: " " } })).toBeNull();
    expect(wordingProvenance(templateFor("checkin"), "checkin", null)).toMatch(/does not store the wording shown when it was signed/);
  });
});
