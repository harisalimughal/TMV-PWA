/**
 * A tiny in-page pub/sub so a push notification (handled by
 * InAppNotificationListener, mounted once at the App root) can tell the Jobs
 * screen "something changed, refetch" without prop-drilling or a shared state
 * library -- the two components have no other reason to know about each other.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by whatever should react to a job possibly having changed (right now:
 *  just JobListScreen). Returns an unsubscribe function. */
export function subscribeJobsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by whatever learns a job might have changed server-side (right now:
 *  InAppNotificationListener, on every push it receives -- a new job assigned, a
 *  job reassigned, a booking edited, etc. all arrive as a push, so treating any of
 *  them as "go refetch the list" is simpler and safer than matching push types). */
export function notifyJobsRefresh(): void {
  listeners.forEach(listener => listener());
}
