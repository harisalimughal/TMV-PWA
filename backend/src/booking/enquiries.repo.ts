import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../db/mongo";
import type { Enquiry, ActionId } from "./types";
import { EMPTY_DRAFT, normalisePostcode, validateStep, type BookingDraft } from "./validation";
import { ENQUIRY_TRANSITIONS, canTransition } from "./states";

export class BookingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>) { super(message); }
}
interface EnquiryDoc { _id: string; requestHash: string; value: Enquiry }
const collection = async () => (await getDb()).collection<EnquiryDoc>("booking_enquiries");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function enquiryActions(enquiry: Enquiry): Enquiry {
  const open = !["accepted", "declined", "expired", "closed"].includes(enquiry.status);
  const actions: ActionId[] = open ? ["review", "close"] : [];
  if (enquiry.status === "new" || enquiry.status === "needs_info") actions.push("request_info");
  // Confirmation is unavailable until Calendar creation and operational job linkage exist.
  return { ...enquiry, allowedActions: actions };
}
export async function allEnquiries(): Promise<Enquiry[]> { return (await (await collection()).find({}).toArray()).map(d => enquiryActions(d.value)); }
export async function getEnquiry(id: string): Promise<Enquiry> {
  const doc = await (await collection()).findOne({ _id: id });
  if (!doc) throw new BookingError(404, "not_found", "That enquiry does not exist.");
  return enquiryActions(doc.value);
}

export function validatedDraft(raw: unknown): BookingDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BookingError(422, "validation_failed", "Enter the enquiry details.");
  const draft = { ...EMPTY_DRAFT };
  for (const key of Object.keys(EMPTY_DRAFT) as (keyof BookingDraft)[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (key === "extras") {
      if (value !== undefined && (!Array.isArray(value) || value.length > 50 || value.some(v => typeof v !== "string" || v.length > 200))) throw new BookingError(422, "validation_failed", "Extras must be a list of text values.");
      draft.extras = value === undefined ? [] : value as string[];
    } else {
      if (value !== undefined && (typeof value !== "string" || value.length > 10000)) throw new BookingError(422, "validation_failed", `Invalid ${key}.`);
      draft[key] = typeof value === "string" ? value.trim() : "";
    }
  }
  const fields = { ...validateStep("customer", draft), ...validateStep("requirements", draft), ...validateStep("schedule", draft) };
  if (Object.keys(fields).length) throw new BookingError(422, "validation_failed", "Check the enquiry details.", fields as Record<string, string>);
  draft.pickupPostcode = normalisePostcode(draft.pickupPostcode)!;
  draft.dropoffPostcode = normalisePostcode(draft.dropoffPostcode)!;
  return draft;
}

export async function createEnquiry(raw: unknown, key: unknown): Promise<Enquiry> {
  if (typeof key !== "string" || !key.trim() || key.length > 200) throw new BookingError(422, "validation_failed", "An idempotency key is required.");
  // Look up retries before time-sensitive validation (a retry can arrive after the moving date).
  const id = `ENQ-${hash(key).slice(0, 32)}`, requestHash = hash(JSON.stringify(raw));
  const col = await collection(), existing = await col.findOne({ _id: id });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new BookingError(409, "idempotency_conflict", "This action key was already used with different details.");
    return enquiryActions(existing.value);
  }
  const d = validatedDraft(raw), now = new Date().toISOString();
  const value: Enquiry = { id, reference: id, status: "new", source: "staff", submittedAt: now,
    customer: { name: d.customerName, phone: d.phone || null, email: d.email || null, customerId: d.customerId || null },
    pickup: { line: d.pickupAddress, postcode: d.pickupPostcode }, dropoff: { line: d.dropoffAddress, postcode: d.dropoffPostcode },
    movingDate: d.date, startTime: d.startTime,
    requirements: { propertySize: d.propertySize || null, vanType: d.vanType, helpers: Number(d.helpers), estimatedHours: Number(d.hours),
      pickupStairs: d.pickupStairs || null, dropoffStairs: d.dropoffStairs || null, inventory: d.inventory || null, extras: d.extras, notes: d.notes || null },
    quotation: null, duplicateOf: null, duplicateReason: null, bookingId: null,
    history: [{ at: now, by: "Admin", text: "Enquiry recorded. No Calendar event or operational job has been created." }], allowedActions: [], version: 1 };
  try { await col.insertOne({ _id: id, requestHash, value }); }
  catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await col.findOne({ _id: id });
    if (winner?.requestHash !== requestHash) throw new BookingError(409, "idempotency_conflict", "This action key was already used with different details.");
    return enquiryActions(winner.value);
  }
  return enquiryActions(value);
}

export async function updateEnquiry(id: string, version: unknown, action: string, body: Record<string, unknown>): Promise<Enquiry> {
  if (!Number.isSafeInteger(version) || Number(version) < 1) throw new BookingError(422, "validation_failed", "A valid record version is required.");
  const current = await getEnquiry(id);
  if (current.version !== version) throw new BookingError(409, "version_conflict", "This enquiry changed. Reload it before saving.");
  const target = action === "close" ? "closed" : action === "request-info" ? "needs_info" : "quoted";
  if (!(action === "manual-quote" && current.status === "quoted") && !canTransition(ENQUIRY_TRANSITIONS, current.status, target)) throw new BookingError(409, "invalid_transition", "That action is not available for this enquiry.");
  const now = new Date().toISOString();
  let text = "Enquiry closed.";
  if (action === "request-info") {
    if (typeof body.note !== "string" || !body.note.trim() || body.note.length > 10000) throw new BookingError(422, "validation_failed", "Enter the information required.");
    text = `Information requested (internal note; no message sent): ${body.note.trim()}`;
  }
  if (action === "manual-quote") {
    if (!Number.isSafeInteger(body.totalPence) || Number(body.totalPence) < 0 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 10000) throw new BookingError(422, "validation_failed", "Enter a non-negative price in pence and a reason.");
    const versions = current.quotation?.versions || [], quoteId = randomUUID();
    current.quotation = { id: current.quotation?.id || randomUUID(), pricingState: "calculated", status: "draft", problem: null, missingFields: [],
      versions: [...versions, { id: quoteId, version: versions.length + 1, createdAt: now, createdBy: "Admin", ruleVersion: null, source: "manual",
        lines: [{ label: "Manual quotation", amountPence: Number(body.totalPence), kind: "base" }], totalPence: Number(body.totalPence), reason: body.reason.trim() }], approvedVersionId: null };
    text = `Manual quotation recorded: ${body.reason.trim()}`;
  }
  const next = enquiryActions({ ...current, status: target, version: current.version + 1, history: [...current.history, { at: now, by: "Admin", text }] });
  const saved = await (await collection()).findOneAndUpdate({ _id: id, "value.version": version as number }, { $set: { value: next } }, { returnDocument: "after" });
  if (!saved) throw new BookingError(409, "version_conflict", "This enquiry changed. Reload it before saving.");
  return next;
}
