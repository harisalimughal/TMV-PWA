import React, { useEffect, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, LogOut, MapPin, RefreshCw } from "lucide-react";
import { logout, type DriverProfile } from "../api/auth";
import { fetchJobsList, type Job } from "../api/jobs";

interface JobListScreenProps {
  driver: DriverProfile;
  onLoggedOut: () => void;
  onOpenJob: (jobId: string) => void;
}

function formatGBP(value: number): string {
  return `£${value.toFixed(2)}`;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  } catch {
    return "";
  }
}

/** "Sat 29 Aug" in Europe/London -- the operating timezone, regardless of the device's
 * own local timezone (see JobWorkflowScreen's londonDateKey for why that distinction
 * matters). Shown on every card now that jobs from more than one day can appear
 * together in the same list. */
function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  } catch {
    return "";
  }
}

export function JobListScreen({ driver, onLoggedOut, onOpenJob }: JobListScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<Job[]>([]);
  const [past, setPast] = useState<Job[]>([]);
  const [next, setNext] = useState<Job[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await fetchJobsList();
      setToday(result.today);
      setPast(result.past);
      setNext(result.next);
    } catch (err: any) {
      setError(err?.message || "Couldn't load your jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      onLoggedOut();
    }
  }

  return (
    <div className="h-screen-safe flex flex-col bg-admin-bg text-admin-ink pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center justify-between px-5 py-4 border-b border-admin-line bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand shrink-0">
            {driver.initials || driver.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">{driver.fullName}</div>
            <div className="text-xs text-admin-muted leading-tight truncate">{driver.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 text-xs text-admin-muted hover:text-admin-ink disabled:opacity-50 px-2 py-1.5 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Your jobs</h1>
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-admin-muted hover:text-admin-ink disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-admin-muted" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-admin-status-red bg-admin-status-red-bg border border-admin-status-red/20 rounded-lg px-3 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Today</h2>
              {today.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {today.map(j => (
                    <JobCard key={j.jobId} job={j} onClick={() => onOpenJob(j.jobId)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-white border border-admin-line px-4 py-6 text-center text-sm text-admin-muted">
                  No job assigned right now. Pull to refresh once you're dispatched.
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-status-amber">Past</h2>
                <div className="flex flex-col gap-2">
                  {past.map(j => (
                    <JobCard key={j.jobId} job={j} onClick={() => onOpenJob(j.jobId)} overdue />
                  ))}
                </div>
              </section>
            )}

            {next.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Next</h2>
                <div className="flex flex-col gap-2">
                  {next.map(j => (
                    <JobCard key={j.jobId} job={j} onClick={() => onOpenJob(j.jobId)} muted />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, onClick, muted, overdue }: { job: Job; onClick: () => void; muted?: boolean; overdue?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-4 flex items-center gap-3 transition-colors shadow-primary ${
        overdue
          ? "bg-admin-status-amber-bg border-admin-status-amber/30 hover:border-admin-status-amber"
          : muted
          ? "bg-white border-admin-line hover:border-admin-muted/50"
          : "bg-admin-brand-soft border-brand/30 hover:border-brand"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold truncate">{job.customerName || "Unnamed customer"}</span>
          {job.status === "IN_PROGRESS" && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-admin-status-green bg-admin-status-green-bg px-1.5 py-0.5 rounded shrink-0">
              In progress
            </span>
          )}
          {overdue && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-admin-status-amber bg-white px-1.5 py-0.5 rounded shrink-0">
              Overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-admin-ink-2 mb-1">
          <MapPin className="w-3 h-3 shrink-0 text-emerald-600" />
          <span className="truncate"><span className="font-semibold">Pickup:</span> {job.pickup || "TBC"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-admin-ink-2 mb-1">
          <MapPin className="w-3 h-3 shrink-0 text-red-600" />
          <span className="truncate"><span className="font-semibold">Drop-off:</span> {job.dropoff || "TBC"}</span>
        </div>
        <div className="text-xs text-admin-muted">
          {formatDate(job.bookedStart)} · {formatTime(job.bookedStart)} · {job.crewSize || "?"} crew · {formatGBP(job.basePrice)}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-admin-muted shrink-0" />
    </button>
  );
}
