import React, { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Clock3, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { fetchServerErrors, type ServerErrorItem, type ServerLogKind } from "../api";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { Action, Badge, EmptyState, ErrorState, FilterSelect, LoadingState, Notice, PageHeader, panel } from "../components/ds";
import { useUrlState } from "../hooks/useUrlState";
import { reportApiRange } from "../utils/reportNavigation";
import { formatDateTime } from "../utils/format";
import { openJob } from "../navigation";

const KIND_OPTIONS = [{ value: "all", label: "All issues" }, { value: "server_error", label: "Server errors" }, { value: "access", label: "Access issues" }, { value: "slow_request", label: "Slow requests" }, { value: "request_issue", label: "Request issues" }];
const KIND_PRESENTATION = {
  server_error: { label: "Server error", icon: AlertCircle, color: "bg-admin-status-red-bg text-admin-status-red" },
  access: { label: "Access issue", icon: ShieldAlert, color: "bg-admin-brand-soft text-admin-brand" },
  slow_request: { label: "Slow request", icon: Clock3, color: "bg-admin-status-amber-bg text-admin-status-amber" },
  request_issue: { label: "Request issue", icon: AlertCircle, color: "bg-admin-surface text-admin-ink-2" }
};

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
    <li className="rounded-2xl border border-admin-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${kind.color}`}><Icon aria-hidden className="h-5 w-5" /></span>
          <div><h2 className="text-[15px] font-semibold text-admin-ink">{item.title}</h2><p className="mt-1 text-[13px] text-admin-ink-2">{item.summary}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Badge>{kind.label}</Badge><Badge>{item.areaLabel}</Badge>{item.audience && <Badge>{item.audience}</Badge>}<time dateTime={item.occurredAt} className="text-[12.5px] text-admin-ink-2">{formatDateTime(item.occurredAt)}</time></div>
      </div>
      {item.operation && <p className="mt-3 text-[13px] font-medium text-admin-ink">Operation: {item.operation}</p>}
      {item.page && <p className="mt-1 text-xs text-admin-ink-2">Page: {item.page}</p>}
      {(item.httpStatus !== undefined || item.durationMs !== undefined) && <p className="mt-3 flex flex-wrap gap-3 text-[12.5px] text-admin-ink-2">{item.httpStatus !== undefined && <span>Response: HTTP {item.httpStatus}</span>}{item.durationMs !== undefined && <span>Time taken: {(item.durationMs / 1000).toFixed(1)} seconds</span>}</p>}
      <details className="mt-3 rounded-xl border border-admin-line p-3 text-xs text-admin-ink-2">
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
      <div className="mt-4 rounded-xl bg-admin-surface p-3 text-[13px]"><span className="font-semibold text-admin-ink">What to do: </span><span className="text-admin-ink-2">{item.nextStep}</span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="break-all text-[12px] text-admin-ink-2">Reference: <span className="select-all font-mono">{item.id}</span></p>
        <div className="flex items-center gap-2">
          {item.jobId && <Action size="sm" onClick={() => openJob(item.jobId!)}>Open {item.jobId}</Action>}
          <Action size="sm" icon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>{copied ? "Copied" : "Copy reference"}</Action>
        </div>
      </div>
    </li>
  );
}

export function LogsPage({ load = fetchServerErrors }: { load?: typeof fetchServerErrors } = {}) {
  const today = dateRangeForPreset("today");
  const [state, update] = useUrlState({ from: today.from!, to: today.to!, page: "1", kind: "all" });
  const range = reportApiRange(state.from, state.to);
  const page = Math.max(1, Number(state.page) || 1);
  const kind = KIND_OPTIONS.some(option => option.value === state.kind) ? state.kind as ServerLogKind | "all" : "all";
  const query = useQuery({ queryKey: ["admin_server_errors", range.from, range.to, page, kind], queryFn: ({ signal }) => load(range.from, range.to, page, signal, kind), retry: 1, staleTime: 10000, refetchInterval: 30000 });
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  return (
    <div className="space-y-5">
      <PageHeader title="Logs" scope="Server errors, access issues and slow requests, explained in plain language. Times are shown in London time."
        actions={<Action icon={<RefreshCw />} loading={query.isFetching} onClick={() => void query.refetch()}>Refresh</Action>} />
      <div className={`${panel} flex flex-wrap items-center gap-3 p-3`}><DateRangePicker presets="overview" from={state.from} to={state.to} onChange={(from, to) => { if (from && to) update({ from, to, page: "1" }); }} /><FilterSelect label="Issue type" value={kind} options={KIND_OPTIONS} onChange={value => update({ kind: value, page: "1" })} /></div>
      <p className="text-[13px] text-admin-ink-2">Only selected issues are recorded, not routine successful requests or general warnings. A recorded issue does not confirm that the problem is still happening. Earlier console history is not imported.</p>
      <p className="text-[12.5px] text-admin-ink-2">Slow requests: {((data?.capture.slowRequestMs ?? 10000) / 1000).toFixed(0)} seconds or longer. Delays are recorded when a response completes; interrupted connections are listed separately.</p>
      {data && (data.capture.failed > 0 || data.capture.omitted > 0) && <Notice tone="warning">Some log entries may be missing from this server run. This history may be incomplete.</Notice>}
      {data && data.capture.pending > 0 && <p role="status" className="text-[13px] text-admin-ink-2">New log entries are being saved. The list refreshes automatically.</p>}
      {query.isError ? <div className={panel}><ErrorState title="Log history is unavailable" message={(query.error as Error)?.message} onRetry={() => void query.refetch()} /></div>
        : !data ? <div className={panel}><LoadingState label="Loading recorded issues" rows={4} /></div>
        : <>
          <p className="text-[13px] font-medium text-admin-ink-2">{data.total} {data.total === 1 ? "event" : "events"} recorded for these filters</p>
          {data.items.length ? <ul aria-label="Recorded issues" className="space-y-3">{data.items.map(item => <ErrorCard key={item.id} item={item} />)}</ul>
            : <div className={panel}><EmptyState title={data.total ? "No issues on this page" : "No issues recorded for these filters"} message="Choose another date range or issue type, or refresh to check for new records." /></div>}
          {pageCount > 1 && <div className="flex items-center justify-end gap-3"><Action size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</Action><span className="text-[13px] text-admin-ink-2">Page {page} of {pageCount}</span><Action size="sm" disabled={page >= pageCount} onClick={() => update({ page: String(page + 1) })}>Next</Action></div>}
        </>}
    </div>
  );
}
