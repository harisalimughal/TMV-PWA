import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { type DriverProfile } from "../api/auth";
import { fetchJobsList, type ApiError, type Job } from "../api/jobs";
import { PullToRefresh } from "../app/PullToRefresh";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import {
  AlertStrip,
  FeaturedJobCard,
  JobFilterBar,
  MobileHeader,
  ScheduleRow,
  ScheduleRowSkeleton,
  ScheduleSection,
  type HomeFilter
} from "../components/driver";
import { Alert, Button, EmptyState } from "../ui";
import { groupJobsByDate } from "../lib/jobDates";

interface JobListScreenProps {
  driver: DriverProfile;
  onOpenJob: (jobId: string) => void;
  onOpenProfile: () => void;
}

/* The selected filter is kept for the session so opening a job and coming back
 * doesn't reset the view. sessionStorage (not localStorage): it's a within-session
 * convenience, not a durable preference. */
const FILTER_KEY = "tmv-jobs:filter";

interface JobsListState {
  today: Job[];
  past: Job[];
  next: Job[];
}

function readStoredFilter(): { filter: HomeFilter; hadStored: boolean } {
  try {
    const f = sessionStorage.getItem(FILTER_KEY);
    const valid = f === "today" || f === "upcoming";
    return { filter: valid ? (f as HomeFilter) : "today", hadStored: valid };
  } catch {
    return { filter: "today", hadStored: false };
  }
}

function jobsLabel(n: number): string {
  return `${n} ${n === 1 ? "job" : "jobs"}`;
}

export function JobListScreen({ driver, onOpenJob }: JobListScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobsList, setJobsList] = useState<JobsListState>({ today: [], past: [], next: [] });
  const scrollRef = useRef<HTMLDivElement>(null);

  const stored = useRef(readStoredFilter());
  const [filter, setFilter] = useState<HomeFilter>(stored.current.filter);
  /* Auto-pick a non-empty filter on first load only when the driver hasn't chosen one. */
  const autoSelectPending = useRef(!stored.current.hadStored);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    setError(null);
    try {
      const result = await fetchJobsList();
      setJobsList({ today: result.today, past: result.past, next: result.next });
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't load your jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const filtered = useMemo(
    () => ({
      today: jobsList.today,
      upcomingGroups: groupJobsByDate(jobsList.next),
      counts: {
        today: jobsList.today.length,
        upcoming: jobsList.next.length,
        previous: jobsList.past.length
      }
    }),
    [jobsList]
  );

  // Persist the selection for this session.
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, filter);
    } catch {
      /* ignore — non-critical */
    }
  }, [filter]);

  // First successful load with no stored choice: if Today is empty but there's
  // work booked ahead, land on Upcoming instead of an empty screen.
  useEffect(() => {
    if (loading || error || !autoSelectPending.current) return;
    autoSelectPending.current = false;
    if (filter !== "today" || filtered.counts.today > 0) return;
    if (filtered.counts.upcoming > 0) setFilter("upcoming");
  }, [loading, error, filter, filtered.counts]);

  const hasAnyJobs = jobsList.today.length + jobsList.past.length + jobsList.next.length > 0;
  const showFilterBar = !loading && !error && hasAnyJobs;

  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content" contentRef={scrollRef} topInset={false}>
      {/* Greeting — scrolls away with the page. Pull down to refresh. */}
      <div className="px-4 pt-5">
        <MobileHeader driver={driver} className="mb-4" />
      </div>

      {/* The one operational fact that outranks everything: unfinished earlier jobs. */}
      {showFilterBar && filtered.counts.previous > 0 && (
        <div className="px-4 pb-1 pt-1">
          <AlertStrip count={filtered.counts.previous} />
        </div>
      )}

      {/* Date filters — the primary Jobs navigation. Sits directly in AppShell's
       *  scroll flow (not inside PullToRefresh, whose overflow context would stop
       *  `position: sticky` working) so it pins to the top as the list scrolls. */}
      {showFilterBar && (
        <div className="sticky top-0 z-20 bg-bg px-4 pb-1 pt-2">
          <JobFilterBar
            value={filter}
            onChange={setFilter}
            counts={{ today: filtered.counts.today, upcoming: filtered.counts.upcoming }}
          />
        </div>
      )}

      <PullToRefresh onRefresh={() => load("refresh")} scrollRef={scrollRef}>
        <div className="px-4 pb-4 pt-5 scroll-pb-nav">
          {loading ? (
            <div>
              <ScheduleRowSkeleton />
              <ScheduleRowSkeleton />
              <ScheduleRowSkeleton />
            </div>
          ) : error ? (
            <Alert
              tone="danger"
              title="Couldn't load your jobs"
              action={
                <Button size="sm" variant="secondary" onClick={() => load("refresh")}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          ) : !hasAnyJobs ? (
            <div className="rounded-xl border border-line bg-surface py-12 text-center shadow-xs">
              <p className="text-heading text-fg">Nothing assigned yet</p>
              <p className="mx-auto mt-1.5 max-w-xs text-body text-fg-muted">
                New work appears here as soon as the office dispatches it.
              </p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => load("refresh")}>
                Refresh
              </Button>
            </div>
          ) : (
            <div key={filter} className="flex animate-in flex-col gap-6 fade-in">
              <FilterView
                filter={filter}
                filtered={filtered}
                onOpenJob={onOpenJob}
                onRefresh={() => load("refresh")}
              />
            </div>
          )}
        </div>
      </PullToRefresh>
    </AppShell>
  );
}

interface FilterViewProps {
  filter: HomeFilter;
  filtered: {
    today: Job[];
    upcomingGroups: ReturnType<typeof groupJobsByDate>;
    counts: { today: number; upcoming: number; previous: number };
  };
  onOpenJob: (jobId: string) => void;
  onRefresh: () => void;
}

function FilterView({ filter, filtered, onOpenJob, onRefresh }: FilterViewProps) {
  const refreshAction = (
    <Button size="sm" variant="secondary" onClick={onRefresh}>
      Refresh
    </Button>
  );

  if (filter === "today") {
    if (filtered.today.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock />}
          title="No jobs scheduled for today"
          description="Enjoy the quiet, or check what's coming up."
          action={refreshAction}
        />
      );
    }
    const [next, ...rest] = filtered.today;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-heading text-fg">Up next</h2>
          <span className="font-mono text-[12.5px] text-fg-subtle">1 of {filtered.today.length}</span>
        </div>
        <FeaturedJobCard job={next} onOpen={() => onOpenJob(next.jobId)} />
        {rest.length > 0 && (
          <ScheduleSection title="Later today" meta={jobsLabel(rest.length)} className="-mx-4">
            {rest.map((job, i) => (
              <ScheduleRow key={job.jobId} job={job} bucket="today" index={i} onOpen={() => onOpenJob(job.jobId)} />
            ))}
          </ScheduleSection>
        )}
      </div>
    );
  }

  // upcoming
  if (filtered.upcomingGroups.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="No upcoming jobs"
        description="Jobs booked for tomorrow onward will show up here."
        action={refreshAction}
      />
    );
  }
  return (
    <>
      {filtered.upcomingGroups.map(group => (
        <ScheduleSection key={group.key} title={group.label} meta={jobsLabel(group.jobs.length)} className="-mx-4">
          {group.jobs.map((job, i) => (
            <ScheduleRow
              key={job.jobId}
              job={job}
              bucket="next"
              index={i}
              onOpen={() => onOpenJob(job.jobId)}
            />
          ))}
        </ScheduleSection>
      ))}
    </>
  );
}
