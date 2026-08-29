/**
 * Mirrors backend/src/workflow/scenario.spec.ts exactly -- kept in sync manually (no
 * shared package between the two projects). Never paraphrase the legal/confirmation
 * copy -- edit only if the client supplies revised wording, and edit both copies.
 */

export type ScenarioKey = "checkin" | "checkout" | "parking" | "liability";
export type ScenarioFieldType = "text" | "tel" | "email" | "date" | "yesno" | "select" | "multiselect";

export interface ScenarioFieldSpec {
  name: string;
  label: string;
  type: ScenarioFieldType;
  required: boolean;
  options?: string[];
}

/** multiselect fields store their choices as a single " | "-joined string (same
 * convention TMV-Chat-bot's original chat/scenario.engine.ts used), not an array. */
export const MULTISELECT_DELIMITER = " | ";

export interface ScenarioSpec {
  key: ScenarioKey;
  title: string;
  noticeTitle?: string;
  noticeText?: string;
  fields: ScenarioFieldSpec[];
  conditionalNotice?: { field: string; whenValue: string; title: string; text: string };
  photoLabel: string;
  photoMin: number;
  photoMax: number;
  signatureText?: string;
}

const CHECK_IN_SIGNATURE_TEXT =
  "By signing this document, you confirm that, All items listed have been checked in and stored.";

const CHECK_OUT_SIGNATURE_TEXT =
  "By signing this document, you confirm that: All items stored with us have been returned in good " +
  "condition. You have checked and received all items listed. We hold no further responsibility or " +
  "liability for these items after receipt.";

const PARKING_LIABILITY_NOTICE_TITLE = "Penalty Charge Liability Notice";

const PARKING_LIABILITY_NOTICE_TEXT =
  "(PCN) In the event a fine is received, You will cover the cost directly, ensuring the company and " +
  "drivers are not held liable. (Penalty Charge Notice) fines typically start at £60 and can go up to " +
  "£180, depending on the severity of the offence. If paid within 14 days, most fines are reduced by " +
  "50%, making the lowest payable amount £45 and the highest £90.";

const LIABILITY_REPORT_SIGNATURE_TEXT =
  "By signing, you assume all liability for any damage to the items shown in the pictures and on the " +
  "list, as explained by the driver. The driver cannot take liability for items not properly packed or " +
  "protected, and such items or place are not covered by our insurance.";

const OVERLOADING_LIABILITY_WAIVER_TITLE = "Overloading Liability Waiver";

const OVERLOADING_LIABILITY_WAIVER_TEXT =
  "By signing, you acknowledge that the driver has explained the need for two vans or multiple trips for " +
  "safety and weight legal compliance. You assume full liability for any overloading fines and damage for " +
  "the items loaded and additional costs, including extra van hire if required. The company and driver are " +
  "not responsible for any penalties or delays caused by exceeding the legal weight limit.";

export const DAMAGE_CATEGORIES = [
  "No protection provided", "Van Overloaded", "Fragile furniture", "Walls", "Ceiling", "Floor",
  "Table glass", "TV", "Artwork", "Picture frames", "Sofa", "Lamps and light fixtures",
  "Computer monitors", "Mirrors", "Fridges and Freezers", "Glassware (e.g., glasses, plates, mirrors, vases)",
  "Electronics (e.g., TVs, computers, printers, monitors)",
  "Furniture with fragile parts (e.g., glass tables, wardrobes with mirrors)",
  "Artwork and picture frames", "Lamps and lampshades", "Ceramics and pottery",
  "Appliances (e.g., washing machines, fridges, microwaves)", "Plants (e.g., indoor plants, pots)",
  "Musical instruments (e.g., pianos, guitars)", "Decorations (e.g., chandeliers, sculptures)",
  "Computers and monitors", "Printers and copiers", "Office furniture (e.g., desks with glass tops, swivel chairs)",
  "Filing cabinets with contents", "Whiteboards or glass boards", "Sensitive documents or folders",
  "Office plants and pots", "Small electronics (e.g., telephones, speakers, headsets)",
  "Meeting room equipment (e.g., projectors, cameras)", "Display materials (e.g., banners, stands)",
  "Disassembly and Reassembly May Affect Furniture Integrity", "Lift Got No Protection – Damage Responsibility Notice"
];

export const SCENARIOS: Record<ScenarioKey, ScenarioSpec> = {
  checkin: {
    key: "checkin",
    title: "Check In",
    fields: [
      { name: "container_number", label: "Container Number", type: "text", required: true },
      { name: "client_name", label: "Client Name", type: "text", required: true },
      { name: "client_phone", label: "Client phone", type: "tel", required: true },
      { name: "client_email", label: "Client Email", type: "email", required: true },
      { name: "client_present", label: "Is the client present?", type: "yesno", required: true },
      { name: "date", label: "Date", type: "date", required: true }
    ],
    photoLabel: "Evidence that the items have been loaded.",
    photoMin: 1,
    photoMax: 1,
    signatureText: CHECK_IN_SIGNATURE_TEXT
  },
  checkout: {
    key: "checkout",
    title: "Check Out",
    fields: [
      { name: "container_number", label: "Container Number", type: "text", required: true },
      { name: "client_name", label: "Client Name", type: "text", required: true },
      { name: "client_email", label: "Client Email", type: "email", required: true },
      { name: "client_present", label: "Is the client present at drop-off?", type: "yesno", required: true },
      { name: "date", label: "Date", type: "date", required: true }
    ],
    photoLabel: "Evidence that the items have been loaded.",
    photoMin: 1,
    photoMax: 1,
    signatureText: CHECK_OUT_SIGNATURE_TEXT
  },
  parking: {
    key: "parking",
    title: "Parking Liability",
    noticeTitle: PARKING_LIABILITY_NOTICE_TITLE,
    noticeText: PARKING_LIABILITY_NOTICE_TEXT,
    fields: [
      { name: "address", label: "Address as shown on the booking", type: "text", required: true },
      { name: "client_name", label: "Full client name as on the booking", type: "text", required: true }
    ],
    photoLabel: "Parking restriction photos",
    photoMin: 1,
    photoMax: 4
  },
  liability: {
    key: "liability",
    title: "Liability Report",
    fields: [
      { name: "damage_categories", label: "Damage Liability & Assembly Risk Notice", type: "multiselect", required: true, options: DAMAGE_CATEGORIES }
    ],
    conditionalNotice: {
      field: "damage_categories", whenValue: "Van Overloaded",
      title: OVERLOADING_LIABILITY_WAIVER_TITLE, text: OVERLOADING_LIABILITY_WAIVER_TEXT
    },
    photoLabel: "Pictures — take as many as needed",
    photoMin: 1,
    photoMax: 8,
    signatureText: LIABILITY_REPORT_SIGNATURE_TEXT
  }
};
