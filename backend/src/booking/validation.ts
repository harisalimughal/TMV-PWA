/**
 * Validation shared by the booking wizard, manual enquiry entry and the website intake (docs/booking-os/04). The
 * server must repeat every check; this only gives early, specific feedback. No price rules live here.
 */
import { fromLondon, minutesBetween } from "./schedule";

const POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export function normalisePostcode(value: string): string | null {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!POSTCODE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}
export const isEmail = (value: string) => EMAIL.test(value.trim());
export const isPhone = (value: string) => PHONE.test(value.trim());

export interface BookingDraft {
  customerName: string; phone: string; email: string; customerId: string;
  pickupPostcode: string; pickupAddress: string; dropoffPostcode: string; dropoffAddress: string; propertySize: string;
  vanType: string; helpers: string; hours: string; inventory: string; pickupStairs: string; dropoffStairs: string; extras: string[]; notes: string;
  date: string; startTime: string;
}

export const EMPTY_DRAFT: BookingDraft = {
  customerName: "", phone: "", email: "", customerId: "", pickupPostcode: "", pickupAddress: "", dropoffPostcode: "", dropoffAddress: "", propertySize: "",
  vanType: "", helpers: "", hours: "", inventory: "", pickupStairs: "", dropoffStairs: "", extras: [], notes: "", date: "", startTime: ""
};

export type Fields<K extends string = string> = Partial<Record<K, string>>;
export const STEPS = ["customer", "requirements", "schedule", "quote", "review"] as const;
export type StepId = typeof STEPS[number];

/** Field errors for one step. `now` is injected so dates are testable. */
export function validateStep(step: StepId, draft: BookingDraft, now: Date = new Date()): Fields<keyof BookingDraft | "form"> {
  const errors: Fields<keyof BookingDraft | "form"> = {};
  if (step === "customer") {
    if (!draft.customerName.trim()) errors.customerName = "Enter the customer's name.";
    if (!draft.phone.trim() && !draft.email.trim()) errors.phone = "Enter a phone number or an email address.";
    else {
      if (draft.phone.trim() && !isPhone(draft.phone)) errors.phone = "Enter a valid phone number.";
      if (draft.email.trim() && !isEmail(draft.email)) errors.email = "Enter a valid email address.";
    }
    if (!draft.pickupAddress.trim()) errors.pickupAddress = "Enter the pickup address.";
    if (!normalisePostcode(draft.pickupPostcode)) errors.pickupPostcode = "Enter a valid UK postcode.";
    if (!draft.dropoffAddress.trim()) errors.dropoffAddress = "Enter the destination address.";
    if (!normalisePostcode(draft.dropoffPostcode)) errors.dropoffPostcode = "Enter a valid UK postcode.";
  }
  if (step === "requirements") {
    if (!draft.vanType) errors.vanType = "Choose a van type.";
    const helpers = Number(draft.helpers);
    if (draft.helpers === "" || !Number.isInteger(helpers) || helpers < 0 || helpers > 6) errors.helpers = "Enter 0 to 6 helpers.";
    const hours = Number(draft.hours);
    if (draft.hours === "" || !Number.isFinite(hours) || hours <= 0 || hours > 24) errors.hours = "Enter the estimated hours (more than 0, up to 24).";
  }
  if (step === "schedule") {
    if (!draft.date) errors.date = "Choose the moving date.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = "Enter a valid date.";
    if (!draft.startTime) errors.startTime = "Choose a start time.";
    else if (!/^\d{2}:\d{2}$/.test(draft.startTime)) errors.startTime = "Enter a valid time.";
    if (!errors.date && !errors.startTime) {
      const start = fromLondon(draft.date, draft.startTime);
      if (!start) errors.startTime = "That time does not exist on that date (clocks change).";
      else if (Date.parse(start) < now.getTime() - 5 * 60000) errors.date = "The start is in the past.";
    }
  }
  return errors;
}

/** Whether the schedule fields give a usable window; the end follows from the estimated hours. */
export function scheduleWindow(draft: BookingDraft): { start: string; end: string } | null {
  const start = draft.date && draft.startTime ? fromLondon(draft.date, draft.startTime) : null;
  const hours = Number(draft.hours);
  if (!start || !Number.isFinite(hours) || hours <= 0) return null;
  const end = new Date(Date.parse(start) + hours * 3600000).toISOString();
  return minutesBetween(start, end) > 0 ? { start, end } : null;
}

/* ------------------------------------------------------------------- intake --- */

export interface IntakeResult { ok: boolean; errors: Record<string, string>; unknownFields: string[] }
const INTAKE_KNOWN = ["customerName", "phone", "email", "pickupPostcode", "dropoffPostcode", "pickupAddress", "dropoffAddress", "propertySize", "vanType", "helpers", "hours", "date", "pickupStairs", "dropoffStairs", "extras", "inventory", "notes"];

/** Checks a website submission against the shared rules. Unknown fields are reported, never dropped silently. */
export function validateIntake(fields: Record<string, unknown>, now: Date = new Date()): IntakeResult {
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : fields[key] == null ? "" : String(fields[key]));
  const draft: BookingDraft = { ...EMPTY_DRAFT, customerName: text("customerName"), phone: text("phone"), email: text("email"), pickupPostcode: text("pickupPostcode"), dropoffPostcode: text("dropoffPostcode"),
    pickupAddress: text("pickupAddress") || "-", dropoffAddress: text("dropoffAddress") || "-", vanType: text("vanType"), helpers: text("helpers"), hours: text("hours"), date: text("date"), startTime: "09:00" };
  const errors = { ...validateStep("customer", draft, now), ...validateStep("requirements", draft, now) } as Record<string, string>;
  if (!draft.date) errors.date = "Choose the moving date.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) errors.date = "Enter a valid date.";
  else if (draft.date < now.toISOString().slice(0, 10)) errors.date = "The moving date is in the past.";
  for (const key of Object.keys(errors)) if (!errors[key]) delete errors[key];
  return { ok: Object.keys(errors).length === 0, errors, unknownFields: Object.keys(fields).filter(key => !INTAKE_KNOWN.includes(key)) };
}

/** A stable idempotency key for a client action: same action, same key; a new action, a new key. */
export function newIdempotencyKey(scope: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${random}`;
}
