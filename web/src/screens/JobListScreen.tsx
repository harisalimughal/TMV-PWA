import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { type DriverProfile } from "../api/auth";
import { fetchJobsList, type ApiError, type Job } from "../api/jobs";
import { PullToRefresh } from "../app/PullToRefresh";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import {
  DatePickerSheet,
  FeaturedJobCard,
  JobFilterBar,
  MobileHeader,
  ScheduleRow,
  ScheduleRowSkeleton,
  ScheduleSection
} from "../components/driver";
import type { JobBucket } from "../components/driver";
import { Alert, Button, EmptyState } from "../ui";
import {
  filterJobsByDate,
  formatDateKeyLong,
  formatDateKeyShort,
  overdueJobs,
  todayKey,
  type JobFilter
} from "../lib/jobDates";

interface JobListScreenProps {
  driver: DriverProfile;
  onOpenJob: (jobId: string) => void;
  onOpenProfile: () => void;
}

/* The selected filter is kept for the session so opening a job and coming back
 * doesn't reset the view. sessionStorage (not localStorage): it's a within-session
 * convenience, not a durable preference. */
const FILTER_KEY = "tmv-jobs:filter";
const DATE_KEY = "tmv-jobs:custom-date";

function readStored(): { filter: JobFilter; customDate: string | null; hadStored: boolean } {
  try {
    const f = sessionStorage.getItem(FILTER_KEY);
    const d = sessionStorage.getItem(DATE_KEY);
    const valid = f === "today" || f === "tomorrow" || f === "upcoming" || f === "custom";
    return {
      filter: valid ? (f as JobFilter) : "today",
      customDate: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
      hadStored: valid
    };
  } catch {
    return { filter: "today", customDate: null, hadStored: false };
  }
}

function jobsLabel(n: number): string {
  return `${n} ${n === 1 ? "job" : "jobs"}`;
}

/** The list bucket a job belongs to for its status chip, given the day being viewed. */
function bucketForKey(key: string): JobBucket {
  const t = todayKey();
  if (key < t) return "past";
  if (key > t) return "next";
  return "today";
}

/** The job that matters right now within Today: in progress first, else the earliest. */
function pickTodayFeatured(today: Job[]): Job | null {
  return today.find(j => j.status === "IN_PROGRESS") ?? today[0] ?? null;
}

export function JobListScreen({ driver, onOpenJob, onOpenProfile }: JobListScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stored = useRef(readStored());
  const [filter, setFilter] = useState<JobFilter>(stored.current.filter);
  const [customDate, setCustomDate] = useState<string | null>(stored.current.customDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* Auto-pick a non-empty filter on first load only when the driver hasn't chosen one. */
  const autoSelectPending = useRef(!stored.current.hadStored);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await fetchJobsList();
      // The API pre-buckets by calendar day; flatten to one list and re-derive the
      // date filters client-side so Tomorrow / Upcoming / a custom date all work
      // from the same data with no extra requests. De-dupe defensively.
      const seen = new Set<string>();
      const flat: Job[] = [];
      for (const job of [...result.past, ...result.today, ...result.next]) {
        if (seen.has(job.jobId)) continue;
        seen.add(job.jobId);
        flat.push(job);
      }
      setJobs(flat);
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't load your jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const filtered = useMemo(() => filterJobsByDate(jobs, customDate), [jobs, customDate]);
  const overdue = useMemo(() => overdueJobs(jobs), [jobs]);

  // Persist the selection for this session.
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, filter);
    } catch {
      /* ignore — non-critical */
    }
  }, [filter]);
  useEffect(() => {
    try {
      if (customDate) sessionStorage.setItem(DATE_KEY, customDate);
      else sessionStorage.removeItem(DATE_KEY);
    } catch {
      /* ignore — non-critical */
    }
  }, [customDate]);

  // First successful load with no stored choice: if Today is empty but there's work
  // later, land on the nearest non-empty filter instead of an empty screen.
  useEffect(() => {
    if (loading || error || !autoSelectPending.current) return;
    autoSelectPending.current = false;
    if (filter !== "today" || filtered.counts.today > 0) return;
    if (filtered.counts.tomorrow > 0) setFilter("tomorrow");
    else if (filtered.counts.upcoming > 0) setFilter("upcoming");
  }, [loading, error, filter, filtered.counts]);

  const featured = filter === "today" ? pickTodayFeatured(filtered.today) : null;
  const featuredId = featured?.jobId;
  const todayRest = filtered.today.filter(j => j.jobId !== featuredId);

  const hasAnyJobs = jobs.length > 0;

  const showFilterBar = !loading && !error && hasAnyJobs;

  return (
    <>
      <AppShell banner={<OfflineBanner />} contentWidth="content" contentRef={scrollRef}>
        {/* Greeting — scrolls away with the page. */}
        <div className="px-4 pt-4">
          <MobileHeader
            driver={driver}
            onOpenProfile={onOpenProfile}
            onRefresh={() => load("refresh")}
            refreshing={refreshing}
            jobCount={loading || error ? undefined : filtered.counts.today}
            className="mb-4"
          />
        </div>

        {/* Date filters — the primary Jobs navigation. Sits directly in AppShell's
         *  scroll flow (not inside PullToRefresh, whose overflow context would stop
         *  `position: sticky` working) so it pins to the top as the list scrolls. */}
        {showFilterBar && (
          <div className="sticky top-0 z-20 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
            <JobFilterBar
              value={filter}
              onChange={setFilter}
              counts={filtered.counts}
              customDate={customDate}
              onOpenDatePicker={() => {
                setFilter("custom");
                setPickerOpen(true);
              }}
              onClearCustomDate={() => {
                setCustomDate(null);
                setFilter("today");
              }}
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
              <>
                {overdue.length > 0 && (
                  <ScheduleSection
                    title="Needs finishing"
                    tone="attention"
                    meta={`${overdue.length}`}
                    className="mb-6"
                  >
                    {overdue.map(job => (
                      <ScheduleRow
                        key={job.jobId}
                        job={job}
                        bucket="past"
                        onOpen={() => onOpenJob(job.jobId)}
                      />
                    ))}
                  </ScheduleSection>
                )}

                <div
                  key={`${filter}:${customDate ?? ""}`}
                  className="flex animate-in flex-col gap-6 fade-in"
                >
                  <FilterView
                    filter={filter}
                    filtered={filtered}
                    featured={featured}
                    todayRest={todayRest}
                    customDate={customDate}
                    onOpenJob={onOpenJob}
                    onOpenPicker={() => setPickerOpen(true)}
                    onRefresh={() => load("refresh")}
                  />
                </div>
              </>
            )}
          </div>
        </PullToRefresh>
      </AppShell>

      <DatePickerSheet
        open={pickerOpen}
        value={customDate}
        onClose={() => setPickerOpen(false)}
        onSelect={key => {
          setCustomDate(key);
          setFilter("custom");
        }}
      />
    </>
  );
}

interface FilterViewProps {
  filter: JobFilter;
  filtered: ReturnType<typeof filterJobsByDate>;
  featured: Job | null;
  todayRest: Job[];
  customDate: string | null;
  onOpenJob: (jobId: string) => void;
  onOpenPicker: () => void;
  onRefresh: () => void;
}

function FilterView({
  filter,
  filtered,
  featured,
  todayRest,
  customDate,
  onOpenJob,
  onOpenPicker,
  onRefresh
}: FilterViewProps) {
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
          description="Enjoy the quiet, or check another day."
          action={refreshAction}
        />
      );
    }
    return (
      <>
        {featured && (
          <FeaturedJobCard job={featured} onOpen={() => onOpenJob(featured.jobId)} />
        )}
        {todayRest.length > 0 && (
          <ScheduleSection title="Today" meta={jobsLabel(todayRest.length)}>
            {todayRest.map(job => (
              <ScheduleRow
                key={job.jobId}
                job={job}
                bucket="today"
                onOpen={() => onOpenJob(job.jobId)}
              />
            ))}
          </ScheduleSection>
        )}
      </>
    );
  }

  if (filter === "tomorrow") {
    if (filtered.tomorrow.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock />}
          title="No jobs scheduled for tomorrow"
          description="Nothing on the board for tomorrow yet."
          action={refreshAction}
        />
      );
    }
    return (
      <ScheduleSection title="Tomorrow" meta={jobsLabel(filtered.tomorrow.length)}>
        {filtered.tomorrow.map(job => (
          <ScheduleRow
            key={job.jobId}
            job={job}
            bucket="next"
            onOpen={() => onOpenJob(job.jobId)}
          />
        ))}
      </ScheduleSection>
    );
  }

  if (filter === "upcoming") {
    if (filtered.upcomingGroups.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock />}
          title="No upcoming jobs"
          description="Jobs further out than tomorrow will show up here."
          action={refreshAction}
        />
      );
    }
    return (
      <>
        {filtered.upcomingGroups.map(group => (
          <ScheduleSection key={group.key} title={group.label} meta={jobsLabel(group.jobs.length)}>
            {group.jobs.map(job => (
              <ScheduleRow
                key={job.jobId}
                job={job}
                bucket="next"
                onOpen={() => onOpenJob(job.jobId)}
              />
            ))}
          </ScheduleSection>
        ))}
      </>
    );
  }

  // custom
  if (!customDate) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Choose a date"
        description="Pick a day to see the jobs scheduled for it."
        action={
          <Button size="sm" variant="secondary" onClick={onOpenPicker}>
            Choose date
          </Button>
        }
      />
    );
  }
  if (filtered.custom.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title={`No jobs scheduled for ${formatDateKeyLong(customDate)}`}
        action={
          <Button size="sm" variant="secondary" onClick={onOpenPicker}>
            Pick another date
          </Button>
        }
      />
    );
  }
  return (
    <ScheduleSection
      title={formatDateKeyShort(customDate)}
      meta={jobsLabel(filtered.custom.length)}
    >
      {filtered.custom.map(job => (
        <ScheduleRow
          key={job.jobId}
          job={job}
          bucket={bucketForKey(customDate)}
          onOpen={() => onOpenJob(job.jobId)}
        />
      ))}
    </ScheduleSection>
  );
}
