import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { AlertCircle, Check, Clock3, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { fetchServerErrors, type ServerErrorItem, type ServerLogKind } from "../api";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { navigateAdmin, reportApiRange } from "../utils/reportNavigation";

const panel = "rounded-card border border-admin-line bg-white p-4 md:p-5";
const button = "inline-flex items-center justify-center gap-2 rounded-control border border-admin-line bg-white px-3 py-2 text-xs font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 disabled:cursor-not-allowed";
const badge = "rounded-full bg-admin-surface px-2 py-1 text-[11px] font-medium text-admin-muted";
const KIND_OPTIONS = [
  { value: "all", label: "All issues" }, { value: "server_error", label: "Server errors" },
  { value: "access", label: "Access issues" }, { value: "slow_request", label: "Slow requests" },
  { value: "request_issue", label: "Request issues" }
];
const KIND_PRESENTATION = {
  server_error: { label: "Server error", icon: AlertCircle, color: "bg-admin-status-red-bg text-admin-status-red" },
  access: { label: "Access issue", icon: ShieldAlert, color: "bg-admin-brand-soft text-admin-brand" },
  slow_request: { label: "Slow request", icon: Clock3, color: "bg-admin-status-amber-bg text-admin-status-amber" },
  request_issue: { label: "Request issue", icon: AlertCircle, color: "bg-admin-surface text-admin-muted" }
};

function openJob(jobId: string) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ section: "jobs", job: jobId }).toString();
  navigateAdmin(url.pathname + url.search);
}

function ErrorCard({ item }: { item: ServerErrorItem }) {
  const [copied, setCopied] = useState(false);
  const kind = KIND_PRESENTATION[item.kind ?? "server_error"];
  const Icon = kind.icon;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([
        `Log reference: ${item.id}`, item.requestId && `Request: ${item.requestId}`,
        item.operation && `Operation: ${item.operation}`, item.endpoint && `Endpoint: ${item.method ?? ""} ${item.endpoint}`,
        item.page && `Page: ${item.page}`, `Occurred: ${item.occurredAt}`, item.requestStartedAt && `Started: ${item.requestStartedAt}`,
        item.httpStatus !== undefined && `Response: HTTP ${item.httpStatus}`, item.durationMs !== undefined && `Duration: ${item.durationMs} ms`,
        item.buildId && `Build: ${item.buildId}`, item.serverRunId && `Server run: ${item.serverRunId}`,
        ...Object.entries(item.filters ?? {}).map(([key, value]) => `Filter ${key}: ${value}`),
        ...(item.timings ?? []).map(row => `${row.name}: ${row.durationMs} ms total, ${row.maxMs} ms longest, ${row.calls} calls, ${row.failed} failed, ${row.pending} pending`)
      ].filter(value => typeof value === "string").join("\n"));
      setCopied(true);
    } catch { /* Reference remains selectable. */ }
  };
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <li className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-card ${kind.color}`}><Icon aria-hidden className="h-5 w-5" /></span>
          <div><h2 className="text-[15px] font-semibold text-admin-ink">{item.title}</h2><p className="mt-1 text-[13px] text-admin-muted">{item.summary}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={badge}>{kind.label}</span><span className={badge}>{item.areaLabel}</span>
          {item.audience && <span className={badge}>{item.audience}</span>}
          <time dateTime={item.occurredAt} className="text-xs text-admin-muted">{DateTime.fromISO(item.occurredAt).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm")}</time>
        </div>
      </div>
      {item.operation && <p className="mt-3 text-[13px] font-medium text-admin-ink">Operation: {item.operation}</p>}
      {item.page && <p className="mt-1 text-xs text-admin-muted">Page: {item.page}</p>}
      {(item.httpStatus !== undefined || item.durationMs !== undefined) && <p className="mt-3 flex flex-wrap gap-3 text-xs text-admin-muted">
        {item.httpStatus !== undefined && <span>Response: HTTP {item.httpStatus}</span>}
        {item.durationMs !== undefined && <span>Time taken: {(item.durationMs / 1000).toFixed(1)} seconds</span>}
      </p>}
      <details className="mt-3 rounded-control border border-admin-line p-3 text-xs text-admin-muted">
        <summary className="cursor-pointer font-medium text-admin-ink">Request details</summary>
        <div className="mt-3 space-y-2 break-all">
          {item.endpoint ? <p>Endpoint: <code>{item.method} {item.endpoint}</code></p> : <p>The endpoint was not recorded for this older entry.</p>}
          {item.requestId && <p>Request: <span className="select-all font-mono">{item.requestId}</span></p>}
          {item.requestStartedAt && <p>Started: {DateTime.fromISO(item.requestStartedAt).setZone("Europe/London").toFormat("dd LLL yyyy, HH:mm:ss.SSS")} London time</p>}
          {item.buildId && <p>Build: <code>{item.buildId}</code></p>}
          {item.serverRunId && <p>Server run: <code>{item.serverRunId}</code></p>}
          {item.filters && <p>Filters: {Object.entries(item.filters).map(([key, value]) => `${key}=${value}`).join(" · ")}</p>}
          {!!item.timings?.length && <div><p className="font-medium text-admin-ink">Database timings</p><p className="mt-1">Parallel calls can overlap. These timings cover database commands, not connection-pool waiting or all server processing.</p>
            <ul className="mt-2 space-y-1">{item.timings.map(row => <li key={row.name}><code>{row.name}</code>: {(row.durationMs / 1000).toFixed(2)}s total · {(row.maxMs / 1000).toFixed(2)}s longest · {row.calls} calls{row.failed ? ` · ${row.failed} failed` : ""}{row.pending ? ` · ${row.pending} pending` : ""}</li>)}</ul>
          </div>}
        </div>
      </details>
      <div className="mt-4 rounded-control bg-admin-surface p-3 text-[13px]"><span className="font-semibold text-admin-ink">What to do: </span><span className="text-admin-muted">{item.nextStep}</span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="break-all text-xs text-admin-muted">Reference: <span className="select-all font-mono">{item.id}</span></p>
        <div className="flex items-center gap-2">
          {item.jobId && <button type="button" className={button} onClick={() => openJob(item.jobId!)}>Open {item.jobId}</button>}
          <button type="button" className={button} onClick={() => void copy()}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy reference"}</button>
        </div>
      </div>
    </li>
  );
}

function locationState() {
  const params = new URLSearchParams(window.location.search);
  const today = dateRangeForPreset("today");
  return { from: params.get("from") || today.from!, to: params.get("to") || today.to!,
    page: Math.max(1, Number(params.get("page")) || 1),
    kind: KIND_OPTIONS.some(option => option.value === params.get("kind")) ? params.get("kind") as ServerLogKind | "all" : "all" as const };
}

/** The dev Logs feature, using main's UI and URL conventions without other dev pages. */
export function LogsPage({ load = fetchServerErrors }: { load?: typeof fetchServerErrors } = {}) {
  const [state, setState] = useState(locationState);
  useEffect(() => {
    const onPop = () => setState(locationState());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if ((key === "page" && value === 1) || (key === "kind" && value === "all")) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    window.history.replaceState({}, "", url.pathname + url.search);
    setState(next);
  };
  const range = reportApiRange(state.from, state.to);
  const query = useQuery({ queryKey: ["admin_server_errors", range.from, range.to, state.page, state.kind],
    queryFn: ({ signal }) => load(range.from, range.to, state.page, signal, state.kind),
    retry: 1, staleTime: 10000, refetchInterval: 30000 });
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-admin-muted">Server errors, access issues and slow requests, explained in plain language. Times are shown in London time.</p>
        <button type="button" className={button} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      <div className={`${panel} flex flex-wrap items-center gap-3`}>
        <DateRangePicker presets={["today", "yesterday", "7d"]} from={state.from} to={state.to} onChange={(from, to) => { if (from && to) update({ from, to, page: 1 }); }} />
        <label className="flex items-center gap-2 text-xs text-admin-muted">Issue type<select className="rounded-control border border-admin-line bg-white p-2 text-admin-ink" value={state.kind} onChange={event => update({ kind: event.target.value as ServerLogKind | "all", page: 1 })}>
          {KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
      </div>
      <p className="text-[13px] text-admin-muted">Only selected issues are recorded, not routine successful requests or general warnings. A recorded issue does not confirm that the problem is still happening. Earlier console history is not imported.</p>
      <p className="text-xs text-admin-muted">Slow requests: {((data?.capture.slowRequestMs ?? 10000) / 1000).toFixed(0)} seconds or longer. Delays are recorded when a response completes; interrupted connections are listed separately.</p>
      {data && (data.capture.failed > 0 || data.capture.omitted > 0) && <p role="status" className="rounded-control border border-admin-status-amber/30 bg-admin-status-amber-bg p-3 text-[13px] text-admin-ink">Some log entries may be missing from this server run. This history may be incomplete.</p>}
      {data && data.capture.pending > 0 && <p role="status" className="text-[13px] text-admin-muted">New log entries are being saved. The list refreshes automatically.</p>}
      {query.isError ? <div className={`${panel} space-y-3`} role="alert"><h2 className="font-semibold">Log history is unavailable</h2><p className="text-sm text-admin-muted">{(query.error as Error)?.message}</p><button className={button} onClick={() => void query.refetch()}>Try again</button></div>
        : !data ? <div className={panel} role="status">Loading recorded issues…</div>
        : <>
          <p className="text-[13px] font-medium text-admin-muted">{data.total} {data.total === 1 ? "event" : "events"} recorded for these filters</p>
          {data.items.length ? <ul aria-label="Recorded issues" className="space-y-3">{data.items.map(item => <ErrorCard key={item.id} item={item} />)}</ul>
            : <div className={panel}><h2 className="font-semibold">{data.total ? "No issues on this page" : "No issues recorded for these filters"}</h2><p className="mt-2 text-sm text-admin-muted">Choose another date range or issue type, or refresh to check for new records.</p></div>}
          {pageCount > 1 && <div className="flex items-center justify-end gap-3"><button className={button} disabled={state.page <= 1} onClick={() => update({ page: state.page - 1 })}>Previous</button><span className="text-xs text-admin-muted">Page {state.page} of {pageCount}</span><button className={button} disabled={state.page >= pageCount} onClick={() => update({ page: state.page + 1 })}>Next</button></div>}
        </>}
    </div>
  );
}
