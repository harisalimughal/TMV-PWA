/**
 * Booking OS client. One typed API over one transport: "live" calls the backend with adminFetch, "preview" calls the
 * in-memory preview server (fictional sample data) through the same route table. The UI never branches on the source
 * except to label it.
 */
import { adminFetch, AdminRequestError } from "../adminTransport";
import { handleBookingRoute } from "./routes";
import { getPreviewServer } from "./preview/instance";
import type { EnquiryCategory } from "./states";
import type { CalendarConfig } from "./calendar/types";
import type { ReconcileFinding } from "./calendar/engine";
import type { IntegrationStatus, OperationRow } from "./preview/calendar";
import type { Booking, BookingActivity, BookingQuery, CommandCentreSummary, Enquiry, EnquiryQuery, Page, ResourceAvailability, ScheduleResponse, MoveRequest, MoveResult, Recommendation, AssignRequest, AssignResult, WriteError } from "./types";
import type { BookingDraft } from "./validation";

export type BookingSource = "live" | "preview";

/** The backend does not offer the Booking OS endpoints (yet). Not an outage and not an empty result. */
export class BookingUnavailableError extends Error {
  constructor() { super("Booking OS is not available on this server yet."); this.name = "BookingUnavailableError"; }
}
/** A contract error with the server's code, e.g. version_conflict or validation_failed. */
export class BookingWriteError extends Error {
  constructor(public status: number, public detail: WriteError) { super(detail.message); this.name = "BookingWriteError"; }
}

type Transport = (method: string, path: string, query?: Record<string, unknown>, body?: unknown, signal?: AbortSignal) => Promise<unknown>;

function toSearch(query: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  return params.toString();
}

function unwrap(status: number, body: unknown): unknown {
  if (status === 404 || status === 501) {
    const code = (body as { error?: { code?: string } } | null)?.error?.code;
    if (code === "not_found") throw new BookingWriteError(status, { code: "not_found", message: "That record no longer exists." } as WriteError);
    throw new BookingUnavailableError();
  }
  if (status >= 400) {
    const detail = (body as { error?: WriteError } | null)?.error ?? ({ code: "request_failed", message: "The request was not accepted." } as WriteError);
    throw new BookingWriteError(status, detail);
  }
  return body;
}

const liveTransport: Transport = async (method, path, query, body, signal) => {
  const search = toSearch(query);
  let response: Response;
  try {
    response = await adminFetch(search ? `${path}?${search}` : path, { method, signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (error instanceof AdminRequestError && (error.status === 501 || error.status === 404)) throw new BookingUnavailableError();
    throw error;
  }
  let parsed: unknown = null;
  try { parsed = await response.json(); } catch { /* empty body */ }
  return unwrap(response.status, parsed);
};

const previewTransport: Transport = async (method, path, query, body) => {
  const result = handleBookingRoute(getPreviewServer(), method, path, toSearch(query), body === undefined ? undefined : JSON.stringify(body));
  if (!result) throw new BookingUnavailableError();
  return unwrap(result.status, result.body);
};

export function createBookingApi(source: BookingSource, transport: Transport = source === "live" ? liveTransport : previewTransport) {
  const get = <T,>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) => transport("GET", path, query, undefined, signal) as Promise<T>;
  const post = <T,>(path: string, body: unknown) => transport("POST", path, undefined, body) as Promise<T>;
  return {
    source,
    summary: (from: string, to: string, signal?: AbortSignal) => get<CommandCentreSummary>("/api/admin/bookings/summary", { from, to }, signal),
    listEnquiries: (query: EnquiryQuery, signal?: AbortSignal) => get<Page<Enquiry>>("/api/admin/enquiries", query as Record<string, unknown>, signal),
    calendarStatus: (signal?: AbortSignal) => get<IntegrationStatus>("/api/admin/integrations/google-calendar", undefined, signal),
    calendarConnect: () => post<IntegrationStatus & { authUrl: string | null }>("/api/admin/integrations/google-calendar/connect", {}),
    calendarDisconnect: () => post<IntegrationStatus>("/api/admin/integrations/google-calendar/disconnect", {}),
    calendarSave: (patch: Partial<CalendarConfig>) => transport("PUT", "/api/admin/integrations/google-calendar", undefined, patch) as Promise<IntegrationStatus>,
    calendarOperations: async (signal?: AbortSignal) => (await get<{ items: OperationRow[] }>("/api/admin/integrations/google-calendar/operations", undefined, signal)).items,
    calendarReconcile: async (signal?: AbortSignal) => (await get<{ items: ReconcileFinding[] }>("/api/admin/integrations/google-calendar/reconcile", undefined, signal)).items,
    calendarRetry: (bookingId: string) => post<{ queued: boolean }>(`/api/admin/integrations/google-calendar/operations/${encodeURIComponent(bookingId)}/retry`, {}),
    enquiryCounts: (signal?: AbortSignal) => get<Record<EnquiryCategory, number>>("/api/admin/enquiries/counts", undefined, signal),
    getEnquiry: (id: string, signal?: AbortSignal) => get<Enquiry>(`/api/admin/enquiries/${encodeURIComponent(id)}`, undefined, signal),
    createEnquiry: (draft: BookingDraft, idempotencyKey: string) => post<Enquiry>("/api/admin/enquiries", { draft, idempotencyKey }),
    calculateQuote: (id: string) => post<unknown>(`/api/admin/enquiries/${encodeURIComponent(id)}/quotations`, {}),
    addManualQuote: (id: string, totalPence: number, reason: string, version: number) => post<Enquiry>(`/api/admin/enquiries/${encodeURIComponent(id)}/manual-quote`, { totalPence, reason, version }),
    closeEnquiry: (id: string, version: number) => post<Enquiry>(`/api/admin/enquiries/${encodeURIComponent(id)}/close`, { version }),
    requestInfo: (id: string, version: number, note: string) => post<Enquiry>(`/api/admin/enquiries/${encodeURIComponent(id)}/request-info`, { version, note }),
    confirmFromEnquiry: (enquiryId: string, version: number, idempotencyKey: string) => post<Booking>("/api/admin/bookings", { enquiryId, version, idempotencyKey }),
    listBookings: (query: BookingQuery, signal?: AbortSignal) => get<Page<Booking>>("/api/admin/bookings", query as Record<string, unknown>, signal),
    getBooking: (id: string, signal?: AbortSignal) => get<Booking>(`/api/admin/bookings/${encodeURIComponent(id)}`, undefined, signal),
    activity: async (id: string, signal?: AbortSignal) => (await get<{ items: BookingActivity[] }>(`/api/admin/bookings/${encodeURIComponent(id)}/activity`, undefined, signal)).items,
    cancelBooking: (id: string, version: number, reason: string) => post<Booking>(`/api/admin/bookings/${encodeURIComponent(id)}/cancel`, { version, reason }),
    schedule: (from: string, to: string, signal?: AbortSignal) => get<ScheduleResponse>("/api/admin/schedule", { from, to }, signal),
    move: (request: MoveRequest, idempotencyKey: string) => post<MoveResult>("/api/admin/schedule/moves", { ...request, idempotencyKey }),
    availability: async (from: string, to: string, signal?: AbortSignal) => (await get<{ items: ResourceAvailability[] }>("/api/admin/availability/drivers", { from, to }, signal)).items,
    recommendations: async (bookingId: string) => (await post<{ items: Recommendation[] }>("/api/admin/dispatch/recommendations", { bookingId })).items,
    assign: (request: AssignRequest, idempotencyKey: string) => post<AssignResult>("/api/admin/assignments", { ...request, idempotencyKey })
  };
}
export type BookingApi = ReturnType<typeof createBookingApi>;
