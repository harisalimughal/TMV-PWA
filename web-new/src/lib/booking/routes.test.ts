import { describe, expect, it } from "vitest";
import { handleBookingRoute } from "./routes";
import { createPreviewServer } from "./preview/server";

const server = () => createPreviewServer(() => new Date("2026-10-17T10:00:00Z"));

describe("booking routes", () => {
  it("ignores paths that are not booking endpoints", () => {
    expect(handleBookingRoute(server(), "GET", "/api/admin/jobs", "")).toBeNull();
    expect(handleBookingRoute(server(), "GET", "/api/driver/me", "")).toBeNull();
  });
  it("lists enquiries and bookings in the page shape", () => {
    const s = server();
    const e = handleBookingRoute(s, "GET", "/api/admin/enquiries", "pageSize=3");
    expect(e?.status).toBe(200);
    expect((e!.body as { items: unknown[] }).items.length).toBeLessThanOrEqual(3);
    const b = handleBookingRoute(s, "GET", "/api/admin/bookings", "");
    expect((b!.body as { pagination: unknown }).pagination).toBeTruthy();
  });
  it("maps contract errors to their status and never prices through the engine", () => {
    const s = server();
    const missing = handleBookingRoute(s, "GET", "/api/admin/bookings/nope", "");
    expect(missing?.status).toBe(404);
    const id = (handleBookingRoute(s, "GET", "/api/admin/enquiries", "")!.body as { items: { id: string }[] }).items[0].id;
    const quote = handleBookingRoute(s, "POST", `/api/admin/enquiries/${id}/quotations`, "", "{}");
    expect(quote?.status).toBe(422);
  });
  it("answers category counts and filters the list by category", () => {
    const s = server();
    const counts = handleBookingRoute(s, "GET", "/api/admin/enquiries/counts", "")!.body as Record<string, number>;
    expect(counts.all).toBeGreaterThan(0);
    const closed = handleBookingRoute(s, "GET", "/api/admin/enquiries", "category=closed")!.body as { items: unknown[] };
    expect(closed.items.length).toBe(counts.closed);
  });
});
