import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookingUnavailableError } from "../../../../lib/booking/client";
import { useBookingSource } from "./source";
import type { BookingQuery, EnquiryQuery } from "../../../../lib/booking";

/** Never retry "not available": it is an answer, not a glitch. */
const retry = (count: number, error: unknown) => !(error instanceof BookingUnavailableError) && count < 1;

export function useBookingSummary(from: string, to: string) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "summary", from, to], queryFn: ({ signal }) => api.summary(from, to, signal), retry });
}
export function useEnquiries(query: EnquiryQuery) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "enquiries", query], queryFn: ({ signal }) => api.listEnquiries(query, signal), retry, placeholderData: previous => previous });
}
export function useEnquiryCounts() {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "enquiry-counts"], queryFn: ({ signal }) => api.enquiryCounts(signal), retry });
}
/** Runs a write, then refreshes every Booking OS query of this source so lists, counts and details agree. */
export function useBookingWrite<V, R>(run: (api: ReturnType<typeof useBookingSource>["api"], variables: V) => Promise<R>) {
  const { api, source } = useBookingSource();
  const client = useQueryClient();
  return useMutation({ mutationFn: (variables: V) => run(api, variables), onSettled: () => client.invalidateQueries({ queryKey: ["bos", source] }) });
}
export function useBookings(query: BookingQuery) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "bookings", query], queryFn: ({ signal }) => api.listBookings(query, signal), retry, placeholderData: previous => previous });
}

export function useBooking(id: string | null) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "booking", id], queryFn: ({ signal }) => api.getBooking(id!, signal), enabled: !!id, retry });
}
export function useBookingActivity(id: string | null, enabled: boolean) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "activity", id], queryFn: ({ signal }) => api.activity(id!, signal), enabled: !!id && enabled, retry });
}
export function useRecommendations(id: string | null, enabled: boolean) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "recommendations", id], queryFn: () => api.recommendations(id!), enabled: !!id && enabled, retry });
}

export function useSchedule(from: string, to: string) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "schedule", from, to], queryFn: ({ signal }) => api.schedule(from, to, signal), retry });
}
export function useDriverAvailability(from: string, to: string) {
  const { api, source } = useBookingSource();
  return useQuery({ queryKey: ["bos", source, "availability", from, to], queryFn: ({ signal }) => api.availability(from, to, signal), retry });
}
