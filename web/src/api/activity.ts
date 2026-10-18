import { request } from "../lib/http";
import { ActivityApiError, type ConversationPage } from "../lib/activity";

/** Driver-inbox seam retained for the supplied hook. A missing service is explicit. */
export async function fetchInbox(): Promise<ConversationPage> {
  try { return await request<ConversationPage>("/api/activity/conversations"); }
  catch (error) {
    const detail = error as { message?: string; code?: string; status?: number };
    throw new ActivityApiError(detail.message || "Messages could not be loaded.", "UNKNOWN", detail.status || 0);
  }
}
