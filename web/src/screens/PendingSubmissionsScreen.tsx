import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { fetchPendingSubmissions, type PendingSubmissionJob } from "../api/jobs";
import { AppShell } from "../app/AppShell";
import { Alert, EmptyState, IconButton, Spinner } from "../ui";
import { subscribeJobsRefresh } from "../lib/jobsRefresh";

export function PendingSubmissionsScreen({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<PendingSubmissionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchPendingSubmissions();
      if (revision.current === request) setJobs(result.jobs);
    } catch (error) {
      if (revision.current === request) setError((error as { message?: string }).message || "Couldn't load pending submissions.");
    } finally { if (revision.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const unsubscribe = subscribeJobsRefresh(() => { void load(); });
    return () => { revision.current++; unsubscribe(); };
  }, [load]);
  return <AppShell topInset={false} contentWidth="content" contentClassName="px-4 py-5 scroll-pb-nav">
    <div className="mb-5 flex items-center justify-between gap-3"><h1 className="text-heading font-semibold text-fg">Pending Submissions</h1><IconButton title="Refresh pending submissions" aria-label="Refresh pending submissions" icon={<RefreshCw />} disabled={loading} onClick={() => { void load(); }} /></div>
    {loading ? <div role="status" className="flex items-center gap-2 text-fg-muted"><Spinner />Loading...</div> : error ? <Alert tone="danger" action={<IconButton title="Retry" aria-label="Retry pending submissions" icon={<RefreshCw />} onClick={() => { void load(); }} />}>{error}</Alert>
      : !jobs.length ? <EmptyState title="No pending submissions" /> : <section aria-label="Pending Manual Details" className="divide-y divide-line">
        {jobs.map(job => { const date = new Date(job.actualFinish || job.bookedStart || job.requiredAt); return <button key={job.jobId} type="button" onClick={() => onOpenJob(job.jobId)} className="flex min-h-20 w-full items-center justify-between gap-3 py-4 text-left text-fg">
          <span className="min-w-0 break-words"><span className="block text-label font-semibold">{job.customerName || job.jobId}</span><span className="block text-meta text-fg-muted">{job.jobId}</span><span className="block text-meta text-fg-muted">{Number.isFinite(date.getTime()) ? date.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) : "Date unavailable"}</span></span>
          <span className="flex shrink-0 items-center gap-2 text-label text-brand">Fill in<ArrowRight size={18} /></span>
        </button>; })}
      </section>}
  </AppShell>;
}
