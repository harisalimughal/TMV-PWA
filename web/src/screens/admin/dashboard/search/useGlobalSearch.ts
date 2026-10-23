/**
 * Runs every search provider for the palette and merges their results.
 *
 * - Local providers (pages, actions, drivers, roster vans) answer on every keystroke.
 * - Server providers wait for a 150 ms pause, are cached by React Query, and are
 *   cancelled through their AbortSignal when the query changes. Their results are
 *   only shown for the query they were requested for, so a slow earlier response can
 *   never replace a newer one.
 * - A provider that fails is reported as failed; it is never shown as "no results".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchDrivers as fetchDriverRoster } from "../../../../api/admin";
import { fetchJobs, fetchScenarios, fetchVanDriverRecords } from "../api";
import { DRIVER_OPTIONS_QUERY_KEY } from "../hooks/useDriverOptions";
import { useAttention } from "../hooks/useAttention";
import { EVIDENCE_KINDS, type EvidenceKind } from "../pages/EvidencePage";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { isLogsQuery } from "./hiddenDestinations";
import {
  jobRequest, parseQuery, rankResults, searchAlerts, searchCustomers, searchDestinations, searchDrivers, searchJobs, searchLiability, searchVehicles,
  LIABILITY_RANGE_PRESET, VAN_RANGE_PRESET, type JobRequest, type ResultType, type SearchResult
} from "./providers";

export const SEARCH_DEBOUNCE_MS = 150;
export const MIN_SERVER_QUERY = 2;
export const JOB_RESULTS_PAGE = 20;

export type Scope = "all" | "jobs" | "drivers" | "customers" | "vehicles" | "liability" | "reports";
export const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "All" }, { id: "jobs", label: "Jobs" }, { id: "drivers", label: "Drivers" }, { id: "customers", label: "Customers" },
  { id: "vehicles", label: "Vehicles" }, { id: "liability", label: "Liability" }, { id: "reports", label: "Reports" }
];
const SCOPE_TYPES: Record<Scope, ResultType[] | null> = {
  all: null, jobs: ["job"], drivers: ["driver"], customers: ["customer"], vehicles: ["vehicle"], liability: ["liability"], reports: ["action", "page"]
};
export const inScope = (scope: Scope, type: ResultType) => !SCOPE_TYPES[scope] || SCOPE_TYPES[scope]!.includes(type);

export interface ProviderStatus { id: string; label: string; state: "idle" | "loading" | "error" | "ok"; ms?: number }

/** Wraps a fetch so its duration is recorded (for the docs' performance figures and tests). */
function timed<T>(timings: Map<string, number>, id: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  return run().finally(() => timings.set(id, Math.round(performance.now() - started)));
}

export function useDebounced(value: string, ms = SEARCH_DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(timer); }, [value, ms]);
  return debounced;
}

export function useGlobalSearch(raw: string, scope: Scope) {
  const text = raw.trim();
  const logsQuery = isLogsQuery(text);
  const debounced = useDebounced(text);
  const settled = debounced === text;
  const serverReady = !logsQuery && settled && text.length >= MIN_SERVER_QUERY;
  const timings = useRef(new Map<string, number>()).current;

  const roster = useQuery({ queryKey: DRIVER_OPTIONS_QUERY_KEY, queryFn: fetchDriverRoster, staleTime: 60 * 60 * 1000, gcTime: 6 * 60 * 60 * 1000 });
  const drivers = roster.data ?? [];
  const parts = useMemo(() => parseQuery(text), [text]);
  const request: JobRequest | null = useMemo(() => serverReady ? jobRequest(parts, drivers) : null, [serverReady, parts, drivers]);
  const wantJobs = !!request && (inScope(scope, "job") || inScope(scope, "customer"));

  const jobs = useQuery({
    queryKey: ["global_search", "jobs", request],
    queryFn: ({ signal }) => timed(timings, "jobs", () => fetchJobs({ q: request!.q, search: request!.q, driver: request!.driver, from: request!.from, to: request!.to, page: 1, pageSize: JOB_RESULTS_PAGE, sort: "bookedStart", dir: "desc" }, signal)),
    enabled: wantJobs, staleTime: 30_000, gcTime: 5 * 60_000, retry: 0
  });

  // The fleet is small: one bounded page of van records for the last 30 days, cached,
  // matched locally (the van list has no reliable registration search of its own).
  const vanRange = dateRangeForPreset(VAN_RANGE_PRESET);
  const vans = useQuery({
    queryKey: ["global_search", "vans", vanRange.from?.slice(0, 10)],
    queryFn: ({ signal }) => timed(timings, "vans", () => fetchVanDriverRecords({ page: 1, from: vanRange.from, to: vanRange.to }, signal)),
    enabled: serverReady && inScope(scope, "vehicle"), staleTime: 5 * 60_000, gcTime: 10 * 60_000, retry: 0
  });

  // Liability records have no text search on the server yet: the latest page of each
  // scenario in the last 30 days is matched locally. See docs/SEARCH.md.
  const kinds = Object.keys(EVIDENCE_KINDS) as EvidenceKind[];
  const liabilityRange = dateRangeForPreset(LIABILITY_RANGE_PRESET);
  const liability = useQueries({
    queries: kinds.map(kind => ({
      queryKey: ["global_search", "liability", kind, liabilityRange.from?.slice(0, 10)],
      queryFn: ({ signal }: { signal: AbortSignal }) => timed(timings, `liability:${kind}`, () => fetchScenarios(kind, 1, undefined, liabilityRange.from, liabilityRange.to, signal)),
      enabled: serverReady && inScope(scope, "liability"), staleTime: 2 * 60_000, gcTime: 10 * 60_000, retry: 0
    }))
  });

  const attention = useAttention();

  const results = useMemo(() => {
    if (!parts.query.tokens.length) return [] as SearchResult[];
    if (logsQuery) return searchDestinations(parts).filter(result => inScope(scope, result.type));
    const all: SearchResult[] = [...searchDestinations(parts), ...searchDrivers(parts, drivers)];
    all.push(...searchVehicles(parts, drivers, serverReady ? vans.data?.items ?? [] : []));
    if (request && jobs.data) {
      all.push(...searchJobs(parts, request, jobs.data.items));
      all.push(...searchCustomers(parts, jobs.data.items));
    }
    if (serverReady) {
      liability.forEach((query, index) => { if (query.data) all.push(...searchLiability(parts, kinds[index], query.data.items)); });
      all.push(...searchAlerts(parts, attention.items));
    }
    return rankResults(all.filter(result => inScope(scope, result.type)));
  }, [parts, drivers, serverReady, vans.data, request, jobs.data, liability, attention.items, scope, logsQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = (query: { isError: boolean; isFetching: boolean; data?: unknown }, enabled: boolean): ProviderStatus["state"] =>
    !enabled ? "idle" : query.isError ? "error" : query.isFetching && !query.data ? "loading" : "ok";
  const statuses: ProviderStatus[] = [
    { id: "drivers", label: "Drivers", state: state(roster, true) },
    { id: "jobs", label: "Jobs", state: state(jobs, wantJobs), ms: timings.get("jobs") },
    { id: "vans", label: "Vehicles", state: state(vans, serverReady && inScope(scope, "vehicle")), ms: timings.get("vans") },
    ...liability.map((query, index) => ({ id: `liability:${kinds[index]}`, label: EVIDENCE_KINDS[kinds[index]].label, state: state(query, serverReady && inScope(scope, "liability")), ms: timings.get(`liability:${kinds[index]}`) }))
  ];

  return {
    text, parts, results, request, statuses,
    /** True while a pause or a server provider is still outstanding for this query. */
    pending: !logsQuery && text.length >= MIN_SERVER_QUERY && (!settled || statuses.some(status => status.state === "loading")),
    failed: statuses.filter(status => status.state === "error")
  };
}
