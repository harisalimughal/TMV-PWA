import React, { useCallback, useEffect, useMemo, useState } from "react";
import { type DriverProfile } from "../api/auth";
import { fetchJobsList, type ApiError, type Job } from "../api/jobs";
import { PullToRefresh } from "../app/PullToRefresh";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import {
  FeaturedJobCard,
  MobileHeader,
  ScheduleRow,
  ScheduleRowSkeleton,
  ScheduleSection
} from "../components/driver";
import { Alert, Button } from "../ui";

interface JobListScreenProps {
  driver: DriverProfile;
  onOpenJob: (jobId: string) => void;
  onOpenProfile: () => void;
}

/** The job that matters right now: in progress first, else next on the clock. */
function pickFeatured(today: Job[], past: Job[], next: Job[]): Job | null {
  const all = [...past, ...today, ...next];
  return all.find(j => j.status === "IN_PROGRESS") ?? today[0] ?? next[0] ?? past[0] ?? null;
}

export function JobListScreen({ driver, onOpenJob, onOpenProfile }: JobListScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<Job[]>([]);
  const [past, setPast] = useState<Job[]>([]);
  const [next, setNext] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await fetchJobsList();
      setToday(result.today);
      setPast(result.past);
      setNext(result.next);
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

  const featured = useMemo(() => pickFeatured(today, past, next), [today, past, next]);
  const featuredId = featured?.jobId;
  const rest = {
    past: past.filter(j => j.jobId !== featuredId),
    today: today.filter(j => j.jobId !== featuredId),
    next: next.filter(j => j.jobId !== featuredId)
  };
  const totalJobs = today.length + past.length + next.length;

  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content">
      <PullToRefresh onRefresh={() => load("refresh")}>
        <div className="flex flex-col gap-6 px-4 pb-4 pt-4 scroll-pb-nav">
          <MobileHeader
            driver={driver}
            onOpenProfile={onOpenProfile}
            onRefresh={() => load("refresh")}
            refreshing={refreshing}
            jobCount={loading ? undefined : totalJobs}
          />

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
          ) : totalJobs === 0 ? (
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
              {featured && <FeaturedJobCard job={featured} onOpen={() => onOpenJob(featured.jobId)} />}

              {rest.past.length > 0 && (
                <ScheduleSection title="Needs finishing" tone="attention" meta={`${rest.past.length}`}>
                  {rest.past.map(job => (
                    <ScheduleRow key={job.jobId} job={job} bucket="past" onOpen={() => onOpenJob(job.jobId)} />
                  ))}
                </ScheduleSection>
              )}

              {rest.today.length > 0 && (
                <ScheduleSection
                  title="Today"
                  meta={`${rest.today.length} ${rest.today.length === 1 ? "job" : "jobs"}`}
                >
                  {rest.today.map(job => (
                    <ScheduleRow key={job.jobId} job={job} bucket="today" onOpen={() => onOpenJob(job.jobId)} />
                  ))}
                </ScheduleSection>
              )}

              {rest.next.length > 0 && (
                <ScheduleSection
                  title="Coming up"
                  meta={`${rest.next.length} ${rest.next.length === 1 ? "job" : "jobs"}`}
                >
                  {rest.next.map(job => (
                    <ScheduleRow key={job.jobId} job={job} bucket="next" onOpen={() => onOpenJob(job.jobId)} />
                  ))}
                </ScheduleSection>
              )}
            </>
          )}
        </div>
      </PullToRefresh>
    </AppShell>
  );
}
