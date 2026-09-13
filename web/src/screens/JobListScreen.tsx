import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { type DriverProfile } from "../api/auth";
import { fetchJobsList, type ApiError, type Job } from "../api/jobs";
import { PullToRefresh } from "../app/PullToRefresh";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import {
  FeaturedJobCard,
  JobDetailsPanel,
  JobFilterBar,
  MobileHeader,
  ScheduleRow,
  ScheduleRowSkeleton,
  ScheduleSection,
  type HomeFilter
} from "../components/driver";
import { Alert, Button, EmptyState } from "../ui";
import { groupJobsByDate, todayKey } from "../lib/jobDates";

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

  const filtered = useMemo(() => {
    // Today shows exactly one job at a time -- whichever the driver is actually
    // mid-way through (IN_PROGRESS), or the earliest still-READY one if none is
    // started yet. Everything else booked for today is "later today" work the
    // driver hasn't reached yet, so it reads the same as any other day still to
    // come -- it moves into Upcoming, not sitting in Today ahead of its turn. Once
    // the active job is COMPLETED it drops out of jobsList.today entirely (see the
    // backend's getJobsGroupedForDriver), so the next-earliest one here becomes
    // "Up next" on the very next load -- one at a time, automatically.
    const active = jobsList.today.find(j => j.status === "IN_PROGRESS") ?? jobsList.today[0] ?? null;
    const laterToday = jobsList.today.filter(j => j.jobId !== active?.jobId);

    return {
      today: active,
      upcomingGroups: groupJobsByDate([...laterToday, ...jobsList.next]),
      counts: {
        today: active ? 1 : 0,
        upcoming: laterToday.length + jobsList.next.length,
        previous: jobsList.past.length
      }
    };
  }, [jobsList]);

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
            <div className="flex flex-col gap-2.5">
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
    today: Job | null;
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
    if (!filtered.today) {
      return (
        <EmptyState
          icon={<CalendarClock />}
          title="No jobs scheduled for today"
          description="Enjoy the quiet, or check what's coming up."
          action={refreshAction}
        />
      );
    }
    return <TodayJobsList job={filtered.today} onOpenJob={onOpenJob} />;
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
  return <UpcomingJobsList groups={filtered.upcomingGroups} />;
}

interface TodayJobsListProps {
  /** The one job Today ever shows -- whichever the driver is actually mid-way
   *  through (IN_PROGRESS), or the earliest still-READY one if none is started yet.
   *  Everything else booked for today has already been moved into Upcoming by the
   *  caller (see JobListScreen's `filtered`), so there's nothing left to list here. */
  job: Job;
  onOpenJob: (jobId: string) => void;
}

/** Today's one actionable job -- the full <FeaturedJobCard> (booking details,
 *  contact, Start Job). One job at a time: the rest of today's work sits in
 *  Upcoming until this one is completed, at which point the next-earliest job
 *  becomes this slot on the next load (see JobListScreen's `filtered`). */
function TodayJobsList({ job, onOpenJob }: TodayJobsListProps) {
  return <FeaturedJobCard job={job} onStarted={onOpenJob} />;
}

/**
 * Upcoming (later today onward) jobs. Not actionable yet -- there's no Start Job, so
 * tapping a row just expands a read-only <JobDetailsPanel> under it (name/email/
 * phone + the rest of the booking behind "More details"), no route/navigate section
 * and no footer button. Purely local: nothing here ever opens another screen.
 */
function UpcomingJobsList({ groups }: { groups: ReturnType<typeof groupJobsByDate> }) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  // Recomputed on every render (not module-scope) so a session left open past
  // midnight doesn't keep labelling a group by yesterday's "today" key.
  const todaysKey = todayKey();

  return (
    <>
      {groups.map(group => (
        <ScheduleSection
          key={group.key}
          title={group.key === todaysKey ? "Later today" : group.label}
          meta={jobsLabel(group.jobs.length)}
        >
          {group.jobs.map((job, i) => (
            <div key={job.jobId} className="flex flex-col gap-2">
              <ScheduleRow
                job={job}
                bucket="next"
                index={i}
                onOpen={() => setExpandedJobId(id => (id === job.jobId ? null : job.jobId))}
              />
              {expandedJobId === job.jobId && <JobDetailsPanel job={job} />}
            </div>
          ))}
        </ScheduleSection>
      ))}
    </>
  );
}
