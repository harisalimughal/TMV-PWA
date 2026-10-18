import { useEffect, useState } from "react";
import { fetchPendingSubmissions } from "../api/jobs";
import { subscribeJobsRefresh } from "./jobsRefresh";

/**
 * How many finished jobs still need the driver's manual details -- shown as a badge on
 * the Pending Submissions nav item and as a banner on Jobs, since those jobs block the
 * next one from starting. Refreshes whenever the jobs list does. Null until known (or
 * when the request fails), so callers show nothing rather than a wrong "0".
 */
export function usePendingCount(enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      fetchPendingSubmissions()
        .then(result => {
          if (alive) setCount(Array.isArray(result?.jobs) ? result.jobs.length : 0);
        })
        .catch(() => {
          /* Badge is a hint, not critical: keep whatever we last knew. */
        });
    };
    load();
    const unsubscribe = subscribeJobsRefresh(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled]);
  return count;
}
