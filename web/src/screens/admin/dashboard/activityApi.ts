/**
 * Admin client for the job activity stream (the contract in src/lib/activity/contract.ts).
 * Same transport as every other admin call: same-origin cookies, timeouts, and a 401 that returns
 * the admin to sign-in. The endpoints are proposed; a server that lacks them answers 404/501 and
 * the screens show "not available" rather than an error.
 */
import { adminFetch } from "../../../lib/adminTransport";
import {
  activityErrorFrom, activityQueryString, ActivityApiError,
  type ActivityPage, type ActivityQuery, type ConversationPage, type ConversationQuery, type UnreadSummary
} from "../../../lib/activity";

async function call<T>(path: string, init: RequestInit | undefined, fallback: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await adminFetch(path, signal ? { ...init, signal } : init);
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    throw new ActivityApiError((error as Error)?.message || fallback, "OFFLINE", 0);
  }
  if (!response.ok) throw await activityErrorFrom(response, fallback);
  return response.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Conversation list: one row per job with its latest entry and the caller's unread count. */
export const fetchConversations = (query: ConversationQuery = {}, signal?: AbortSignal) =>
  call<ConversationPage>(`/api/admin/activity/conversations${activityQueryString(query)}`, undefined, "Conversations could not be loaded.", signal);

/** One job's conversation. No cursor: the latest page. `after`: anything newer (recovery and polling). `before`: older history. */
export const fetchJobActivity = (jobId: string, query: Pick<ActivityQuery, "after" | "before" | "limit"> = {}, signal?: AbortSignal) =>
  call<ActivityPage>(`/api/admin/jobs/${encodeURIComponent(jobId)}/activity${activityQueryString(query)}`, undefined, "This conversation could not be loaded.", signal);

/** The global feed, newest first, across every job the caller may see. */
export const fetchActivityFeed = (query: ActivityQuery = {}, signal?: AbortSignal) =>
  call<ActivityPage>(`/api/admin/activity${activityQueryString(query)}`, undefined, "Activity could not be loaded.", signal);

export const fetchActivityUnread = (signal?: AbortSignal) =>
  call<UnreadSummary>("/api/admin/activity/unread", undefined, "Unread count could not be loaded.", signal);

/** Marks the conversation read up to an entry. Called only when the admin has actually seen it. */
export const markConversationRead = (jobId: string, upToId: string) =>
  call<{ ok: true }>(`/api/admin/jobs/${encodeURIComponent(jobId)}/activity/read`, json({ upToId }), "Could not update the read state.");
