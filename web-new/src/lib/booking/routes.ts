/**
 * The proposed HTTP contract for Booking OS as one table: path and method to a call on a server object. The dev and
 * demo mock API uses it with the in-memory preview server, so the mock answers exactly the paths the live client
 * calls. A real backend must answer the same paths and shapes (docs/booking-os/02-TARGET-ARCHITECTURE.md).
 * The idempotency key travels in the JSON body as `idempotencyKey`.
 */
import { ContractError, type PreviewServer } from "./preview/server";
import { ConfigError } from "./preview/calendar";
import type { AssignRequest, BookingQuery, EnquiryQuery, MoveRequest } from "./types";
import type { BookingDraft } from "./validation";

export interface RouteResponse { status: number; body: unknown }
const ok = (body: unknown): RouteResponse => ({ status: 200, body });

const num = (value: string | null): number | undefined => (value === null || value === "" ? undefined : Number(value));
const str = (params: URLSearchParams, key: string) => params.get(key) || undefined;

export const BOOKING_PATHS = {
  summary: "/api/admin/bookings/summary", bookings: "/api/admin/bookings", enquiries: "/api/admin/enquiries", schedule: "/api/admin/schedule",
  moves: "/api/admin/schedule/moves", driverAvailability: "/api/admin/availability/drivers", recommendations: "/api/admin/dispatch/recommendations", assignments: "/api/admin/assignments"
} as const;

export function handleBookingRoute(server: PreviewServer, method: string, path: string, search: string, bodyText?: string): RouteResponse | null {
  if (!path.startsWith("/api/admin/") || !/^\/api\/admin\/(bookings|enquiries|schedule|availability|dispatch|assignments|integrations\/google-calendar)/.test(path)) return null;
  const params = new URLSearchParams(search);
  const body = (): Record<string, unknown> => { try { return bodyText ? JSON.parse(bodyText) : {}; } catch { return {}; } };
  try {
    const gcal = path.match(/^\/api\/admin\/integrations\/google-calendar(\/[a-z-]+)?(\/[^/]+)?(\/[a-z-]+)?$/);
    if (gcal) {
      const cal = server.calendar, sub = gcal[1], arg = gcal[2], act = gcal[3];
      if (!sub && method === "GET") return ok(cal.status());
      if (!sub && method === "PUT") { try { cal.updateConfig(body() as never); } catch (error) { if (error instanceof ConfigError) return { status: 422, body: { error: { code: "invalid", message: error.message, fields: error.fields } } }; throw error; } return ok(cal.status()); }
      if (sub === "/connect" && method === "POST") { cal.connect(); return ok({ ...cal.status(), authUrl: null }); }
      if (sub === "/disconnect" && method === "POST") { cal.disconnect(); return ok(cal.status()); }
      if (sub === "/operations" && !arg && method === "GET") return ok({ items: cal.operations(str(params, "status")) });
      if (sub === "/operations" && arg && act === "/retry" && method === "POST") { void cal.retry(decodeURIComponent(arg.slice(1))); return ok({ queued: true }); }
      if (sub === "/reconcile" && method === "GET") return ok({ items: cal.reconcileNow() });
    }
    if (path === BOOKING_PATHS.summary && method === "GET") return ok(server.summary(params.get("from") ?? "", params.get("to") ?? ""));
    if (path === BOOKING_PATHS.bookings && method === "GET") {
      const query: BookingQuery = { q: str(params, "q"), status: str(params, "status"), driver: str(params, "driver"), van: str(params, "van"), assignment: str(params, "assignment"), source: str(params, "source"), from: str(params, "from"), to: str(params, "to"), submittedFrom: str(params, "submittedFrom"), submittedTo: str(params, "submittedTo"), sort: str(params, "sort"), dir: (str(params, "dir") as "asc" | "desc" | undefined), page: num(params.get("page")), pageSize: num(params.get("pageSize")) };
      return ok(server.listBookings(query));
    }
    if (path === BOOKING_PATHS.bookings && method === "POST") { const b = body(); return { status: 201, body: server.confirmFromEnquiry(String(b.enquiryId), Number(b.version), b.idempotencyKey as string | undefined) }; }
    const booking = path.match(/^\/api\/admin\/bookings\/([^/]+)(\/[a-z]+)?$/);
    if (booking) {
      const id = decodeURIComponent(booking[1]);
      if (!booking[2] && method === "GET") return ok(server.getBooking(id));
      if (booking[2] === "/activity" && method === "GET") return ok({ items: server.activity(id) });
      if (booking[2] === "/cancel" && method === "POST") { const b = body(); return ok(server.cancelBooking(id, Number(b.version), String(b.reason ?? ""))); }
    }
    if (path === BOOKING_PATHS.enquiries && method === "GET") {
      const query: EnquiryQuery = { q: str(params, "q"), status: str(params, "status"), pricing: str(params, "pricing"), source: str(params, "source"), from: str(params, "from"), to: str(params, "to"), movingFrom: str(params, "movingFrom"), movingTo: str(params, "movingTo"), category: str(params, "category"), page: num(params.get("page")), pageSize: num(params.get("pageSize")) };
      return ok(server.listEnquiries(query));
    }
    if (path === BOOKING_PATHS.enquiries && method === "POST") { const b = body(); return { status: 201, body: server.createEnquiry(b.draft as BookingDraft, b.idempotencyKey as string | undefined) }; }
    if (path === `${BOOKING_PATHS.enquiries}/counts` && method === "GET") return ok(server.enquiryCounts());
    const enquiry = path.match(/^\/api\/admin\/enquiries\/([^/]+)(\/[a-z-]+)?$/);
    if (enquiry) {
      const id = decodeURIComponent(enquiry[1]), b = body();
      if (!enquiry[2] && method === "GET") return ok(server.getEnquiry(id));
      if (enquiry[2] === "/manual-quote" && method === "POST") return ok(server.addManualQuote(id, Number(b.totalPence), String(b.reason ?? ""), Number(b.version)));
      if (enquiry[2] === "/close" && method === "POST") return ok(server.closeEnquiry(id, Number(b.version)));
      if (enquiry[2] === "/request-info" && method === "POST") return ok(server.requestInfo(id, Number(b.version), String(b.note ?? "")));
      if (enquiry[2] === "/quotations" && method === "POST") return { status: 422, body: { error: { code: "pricing_unavailable", message: "The pricing engine is not connected, so no price can be calculated. Record a manual price with a reason instead." } } };
    }
    if (path === BOOKING_PATHS.schedule && method === "GET") return ok(server.schedule(params.get("from") ?? "", params.get("to") ?? ""));
    if (path === BOOKING_PATHS.moves && method === "POST") { const b = body(); return ok(server.move(b as unknown as MoveRequest, b.idempotencyKey as string | undefined)); }
    if (path === BOOKING_PATHS.driverAvailability && method === "GET") return ok({ items: server.availability(params.get("from") ?? "", params.get("to") ?? "") });
    if (path === BOOKING_PATHS.recommendations && method === "POST") return ok({ items: server.recommendations(String(body().bookingId)) });
    if (path === BOOKING_PATHS.assignments && method === "POST") { const b = body(); return ok(server.assign(b as unknown as AssignRequest, b.idempotencyKey as string | undefined)); }
  } catch (error) {
    if (error instanceof ContractError) return { status: error.status, body: { error: error.detail } };
    throw error;
  }
  return null;
}
