import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, isEmail, isPhone, newIdempotencyKey, normalisePostcode, scheduleWindow, validateIntake, validateStep, type BookingDraft } from "./validation";

const now = new Date("2026-10-17T09:00:00Z");
const draft = (patch: Partial<BookingDraft> = {}): BookingDraft => ({ ...EMPTY_DRAFT, ...patch });

describe("postcodes, email, phone", () => {
  it("normalises valid UK postcodes and rejects the rest", () => {
    expect(normalisePostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normalisePostcode(" e1 6an ")).toBe("E1 6AN");
    expect(normalisePostcode("EC1A 1BB")).toBe("EC1A 1BB");
    expect(normalisePostcode("12345")).toBeNull();
    expect(normalisePostcode("SW1A")).toBeNull();
    expect(normalisePostcode("")).toBeNull();
  });
  it("checks email and phone shape", () => {
    expect(isEmail("a@b.co")).toBe(true); expect(isEmail("a@b")).toBe(false); expect(isEmail("no spaces@x.com")).toBe(false);
    expect(isPhone("+44 20 7946 0000")).toBe(true); expect(isPhone("abc")).toBe(false);
  });
});

describe("step validation", () => {
  it("customer step needs a name, a way to contact, both addresses and valid postcodes", () => {
    const errors = validateStep("customer", draft(), now);
    expect(Object.keys(errors).sort()).toEqual(["customerName", "dropoffAddress", "dropoffPostcode", "phone", "pickupAddress", "pickupPostcode"]);
    const ok = draft({ customerName: "A Customer", email: "a@b.co", pickupAddress: "1 High St", pickupPostcode: "E1 6AN", dropoffAddress: "2 Low St", dropoffPostcode: "SW1A 1AA" });
    expect(validateStep("customer", ok, now)).toEqual({});
  });
  it("accepts a phone alone or an email alone but rejects a bad one", () => {
    const base = { customerName: "A", pickupAddress: "x", pickupPostcode: "E1 6AN", dropoffAddress: "y", dropoffPostcode: "SW1A 1AA" };
    expect(validateStep("customer", draft({ ...base, phone: "020 7946 0000" }), now)).toEqual({});
    expect(validateStep("customer", draft({ ...base, email: "bad" }), now).email).toMatch(/valid email/);
    expect(validateStep("customer", draft({ ...base, phone: "x" }), now).phone).toMatch(/valid phone/);
  });
  it("requirements step bounds helpers and hours and requires a van", () => {
    expect(Object.keys(validateStep("requirements", draft(), now)).sort()).toEqual(["helpers", "hours", "vanType"]);
    expect(validateStep("requirements", draft({ vanType: "Large", helpers: "7", hours: "3" }), now).helpers).toBeDefined();
    expect(validateStep("requirements", draft({ vanType: "Large", helpers: "2", hours: "0" }), now).hours).toBeDefined();
    expect(validateStep("requirements", draft({ vanType: "Large", helpers: "2", hours: "25" }), now).hours).toBeDefined();
    expect(validateStep("requirements", draft({ vanType: "Large", helpers: "2", hours: "3.5" }), now)).toEqual({});
  });
  it("schedule step rejects missing, malformed, past and non-existent times", () => {
    expect(Object.keys(validateStep("schedule", draft(), now)).sort()).toEqual(["date", "startTime"]);
    expect(validateStep("schedule", draft({ date: "2026-10-16", startTime: "09:00" }), now).date).toMatch(/past/);
    expect(validateStep("schedule", draft({ date: "2026-10-18", startTime: "9am" }), now).startTime).toBeDefined();
    expect(validateStep("schedule", draft({ date: "2027-03-28", startTime: "01:30" }), now).startTime).toMatch(/does not exist/);
    expect(validateStep("schedule", draft({ date: "2026-10-18", startTime: "09:00" }), now)).toEqual({});
  });
  it("derives the window from the date, time and hours", () => {
    expect(scheduleWindow(draft({ date: "2026-10-18", startTime: "09:00", hours: "3" }))).toEqual({ start: "2026-10-18T08:00:00.000Z", end: "2026-10-18T11:00:00.000Z" });
    expect(scheduleWindow(draft({ date: "2026-10-18", startTime: "09:00", hours: "" }))).toBeNull();
    expect(scheduleWindow(draft({ date: "", startTime: "09:00", hours: "2" }))).toBeNull();
  });
});

describe("website intake validation", () => {
  const good = { customerName: "A Customer", email: "a@b.co", pickupPostcode: "E1 6AN", dropoffPostcode: "SW1A 1AA", vanType: "Large", helpers: 2, hours: 3, date: "2026-10-20" };
  it("accepts a complete submission", () => { expect(validateIntake(good, now)).toEqual({ ok: true, errors: {}, unknownFields: [] }); });
  it("reports what is wrong, per field", () => {
    const result = validateIntake({ ...good, email: "bad", pickupPostcode: "nope", date: "2026-10-01" }, now);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["date", "email", "pickupPostcode"]);
  });
  it("reports unknown fields instead of dropping them silently", () => {
    expect(validateIntake({ ...good, promoCode: "X", utm: "y" }, now).unknownFields).toEqual(["promoCode", "utm"]);
  });
  it("does not trust numbers sent as the wrong type", () => {
    expect(validateIntake({ ...good, helpers: "many" }, now).errors.helpers).toBeDefined();
  });
});

describe("idempotency keys", () => {
  it("are unique per action and carry the scope", () => {
    const a = newIdempotencyKey("booking"), b = newIdempotencyKey("booking");
    expect(a).not.toBe(b);
    expect(a.startsWith("booking:")).toBe(true);
  });
});
