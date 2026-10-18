import { useQuery } from "@tanstack/react-query";
import { isUnavailable, useActivityThread, THREAD_POLL_MS, type ActivityThread } from "../../../../lib/activity/useThread";
import type { ConversationQuery } from "../../../../lib/activity";
import { fetchActivityUnread, fetchConversations, fetchJobActivity } from "../activityApi";

export { isUnavailable, THREAD_POLL_MS };
export type { ActivityThread, ThreadStatus } from "../../../../lib/activity/useThread";
export const CONVERSATION_POLL_MS = 20_000;
const UNREAD_POLL_MS = 30_000;

export function useConversations(query: ConversationQuery) {
  return useQuery({
    queryKey: ["activity", "conversations", query],
    queryFn: ({ signal }) => fetchConversations(query, signal),
    // A server that does not provide activity answers 404/501 every time: stop asking until the page reloads.
    refetchInterval: query => (isUnavailable(query.state.error) ? false : CONVERSATION_POLL_MS),
    refetchOnWindowFocus: query => !isUnavailable(query.state.error),
    retry: (count, error) => !isUnavailable(error) && count < 1,
    placeholderData: previous => previous
  });
}

/** Total unread for the nav badge. Silent when the feature is unavailable: no badge, no error. */
export function useActivityUnread(enabled = true): number {
  const { data } = useQuery({
    queryKey: ["activity", "unread"],
    queryFn: ({ signal }) => fetchActivityUnread(signal),
    enabled,
    // Same rule: no polling, and no refetch on focus, once the server has said it does not offer activity.
    refetchInterval: query => (isUnavailable(query.state.error) ? false : UNREAD_POLL_MS),
    refetchOnWindowFocus: query => !isUnavailable(query.state.error),
    retry: false
  });
  return data?.total ?? 0;
}

/** One job's conversation as the admin sees it. See useActivityThread. */
export const useJobThread = (jobId: string | undefined, pollMs = THREAD_POLL_MS): ActivityThread => useActivityThread(jobId, fetchJobActivity, pollMs);
