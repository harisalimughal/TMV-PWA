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
  JobDetailsPanel,
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
    return <TodayJobsList jobs={filtered.today} onOpenJob={onOpenJob} />;
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
  /** Sorted earliest-first, same as the backend sends it. */
  jobs: Job[];
  onOpenJob: (jobId: string) => void;
}

/**
 * Today's jobs as an accordion: exactly one is expanded into the full
 * <FeaturedJobCard> (booking details, contact, Start Job) at a time — every other
 * job sits as a compact <ScheduleRow>. Tapping a compact row expands it; there's no
 * separate "View Job" screen to navigate to for this any more, only
 * <FeaturedJobCard>'s own Start Job button ever leaves this screen.
 *
 * "Up next" is a pinned slot, not just whichever card happens to be expanded: it's
 * always whichever job the driver is actually mid-way through (IN_PROGRESS), or the
 * earliest still-READY one if none is started yet — the same priority
 * jobs.service.ts's getNextJobForDriver uses server-side for the single-job "active"
 * screen. Expanding a *different* job (previewing something later today) doesn't
 * replace that slot; it shrinks "Up next" down to a small card and inserts the
 * previewed job's big card directly beneath it, so the driver never loses sight of
 * what's actually next while looking at something else.
 */
function TodayJobsList({ jobs, onOpenJob }: TodayJobsListProps) {
  const activeJobId = useMemo(() => {
    const active = jobs.find(j => j.status === "IN_PROGRESS");
    return (active ?? jobs[0])?.jobId ?? null;
  }, [jobs]);

  const [expandedJobId, setExpandedJobId] = useState<string | null>(activeJobId);

  // Keep the expansion pointed at a real job -- if the driver's pick dropped out of
  // today's list (completed elsewhere, or the list just refreshed), fall back to
  // whichever job is now active/next rather than silently expanding nothing.
  useEffect(() => {
    if (expandedJobId && jobs.some(j => j.jobId === expandedJobId)) return;
    setExpandedJobId(activeJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, jobs]);

  const activeJob = jobs.find(j => j.jobId === activeJobId) ?? null;
  const previewedJob =
    expandedJobId && expandedJobId !== activeJobId ? jobs.find(j => j.jobId === expandedJobId) ?? null : null;
  const rest = jobs.filter(j => j.jobId !== activeJobId && j.jobId !== expandedJobId);
  // Everything today besides "Up next", regardless of whether one of them is
  // currently pulled out into the preview card above -- the "Later today" heading
  // stays put either way, it's only the rows underneath that come and go.
  const laterCount = jobs.length - (activeJob ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2 className="px-1 text-heading text-fg">Up next</h2>
        {activeJob &&
          (previewedJob ? (
            <ScheduleRow
              job={activeJob}
              bucket="today"
              onOpen={() => setExpandedJobId(activeJob.jobId)}
            />
          ) : (
            <FeaturedJobCard job={activeJob} onStarted={onOpenJob} />
          ))}
      </div>
      {/* "Later today" always sits directly above that list, whether or not one of
          its jobs is currently pulled open into the big card -- the previewed job is
          still a later-today job, so it renders as this section's first item rather
          than floating above the heading. */}
      {laterCount > 0 && (
        <ScheduleSection title="Later today" meta={jobsLabel(laterCount)}>
          {previewedJob && <FeaturedJobCard job={previewedJob} onStarted={onOpenJob} />}
          {rest.map((job, i) => (
            <ScheduleRow
              key={job.jobId}
              job={job}
              bucket="today"
              index={i}
              onOpen={() => setExpandedJobId(job.jobId)}
            />
          ))}
        </ScheduleSection>
      )}
    </div>
  );
}

/**
 * Upcoming (tomorrow onward) jobs. Not actionable yet -- there's no Start Job, so
 * tapping a row just expands a read-only <JobDetailsPanel> under it (name/email/
 * phone + the rest of the booking behind "More details"), no route/navigate section
 * and no footer button. Purely local: nothing here ever opens another screen.
 */
function UpcomingJobsList({ groups }: { groups: ReturnType<typeof groupJobsByDate> }) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  return (
    <>
      {groups.map(group => (
        <ScheduleSection key={group.key} title={group.label} meta={jobsLabel(group.jobs.length)}>
          {group.jobs.map((job, i) => (
            <div key={job.jobId} className="flex flex-col gap-2">
              <ScheduleRow
                job={job}
                bucket="next"
                index={i}
                onOpen={() => setExpandedJobId(id => (id === job.jobId ? null : job.jobId))}
              />
              {expandedJobId === job.jobId && <JobDetailsPanel job={job} alwaysExpanded />}
            </div>
          ))}
        </ScheduleSection>
      ))}
    </>
  );
}
