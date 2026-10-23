/**
 * Global search providers: each turns data the admin already has access to into
 * ranked results with an exact destination.
 *
 * Nothing here widens access. Drivers and vans come from the roster the dashboard
 * already loads; jobs, van records and liability records come from the existing
 * authenticated admin endpoints, which apply the backend's own authorisation. Results
 * are bounded (one page per request) and never the whole database.
 */
import { DateTime } from "luxon";
import type { AdminDriver } from "../../../../api/admin";
import type { NormalizedJob, ScenarioItem, VanDriverRecordItem } from "../types";
import type { AttentionItem } from "../hooks/useAttention";
import { NAV, sectionHref } from "../navigation";
import { EVIDENCE_KINDS, evidenceFields, type EvidenceKind } from "../pages/EvidencePage";
import { formatVanReg } from "../utils/drivers";
import { vehicleAttention } from "../utils/vehicleStatus";
import { driverReportHref, type ReportTab } from "../utils/reportNavigation";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { jobStatusLabel } from "../components/StatusBadge";
import { formatDate, formatDateTime } from "../utils/format";
import { compact, fold, normalizeQuery, scoreRecord, TIER, type Field, type Normalized } from "./searchCore";
import { isLogsQuery } from "./hiddenDestinations";

export type ResultType = "action" | "page" | "driver" | "job" | "customer" | "vehicle" | "liability" | "alert";
export type Target = { kind: "href"; href: string } | { kind: "job"; jobId: string };

export interface SearchResult {
  type: ResultType;
  /** Unique within the type; results are deduplicated by type + id. */
  id: string;
  label: string;
  detail?: string;
  /** Short facts for the preview panel. Only data already in the result. */
  preview?: Array<{ label: string; value: string }>;
  target: Target;
  score: number;
}

/** Tie-breaker after the match tier: records before navigation. */
export const TYPE_WEIGHT: Record<ResultType, number> = { driver: 9, job: 8, vehicle: 7, customer: 6, liability: 5, page: 4, action: 3, alert: 2 };

export const GROUP_ORDER: ResultType[] = ["driver", "job", "customer", "vehicle", "liability", "action", "page", "alert"];
export const GROUP_LABEL: Record<ResultType, string> = {
  driver: "Drivers", job: "Jobs", customer: "Customers", vehicle: "Vehicles", liability: "Liability", action: "Reports and actions", page: "Pages", alert: "Alerts"
};

export function rankResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  for (const result of results) {
    const key = `${result.type}:${result.id}`;
    const existing = seen.get(key);
    if (!existing || result.score > existing.score) seen.set(key, result);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type] || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------ query parts --- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const POSTCODE = /\b([a-z]{1,2}\d[a-z\d]?)\s+(\d[a-z]{2})\b/i;

export interface QueryParts {
  raw?: string;
  query: Normalized;
  /** A London day named in the query ("13 oct", "13/10", "2026-10-13", "today"). */
  day: DateTime | null;
  /** Tokens left once the date is taken out; a spaced postcode is kept as one token. */
  rest: string[];
}

export function parseQuery(raw: string, now = DateTime.now().setZone("Europe/London")): QueryParts {
  const query = normalizeQuery(raw);
  let text = query.text;
  let day: DateTime | null = null;
  const take = (match: RegExpMatchArray | null, build: (m: RegExpMatchArray) => DateTime | null) => {
    if (day || !match) return;
    const value = build(match);
    if (value?.isValid) { day = value.startOf("day"); text = text.replace(match[0], " "); }
  };
  const zone = { zone: "Europe/London" };
  take(text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/), m => DateTime.fromObject({ year: +m[1], month: +m[2], day: +m[3] }, zone));
  take(text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/), m => DateTime.fromObject({ year: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.year, month: +m[2], day: +m[1] }, zone));
  take(text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/), m => {
    const month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    return month ? DateTime.fromObject({ year: m[3] ? +m[3] : now.year, month, day: +m[1] }, zone) : null;
  });
  take(text.match(/\b(today|yesterday|tomorrow)\b/), m => m[1] === "today" ? now : m[1] === "yesterday" ? now.minus({ days: 1 }) : now.plus({ days: 1 }));
  text = text.replace(POSTCODE, "$1 $2");
  const rest = text.split(" ").filter(Boolean).map(token => token.replace(" ", " "));
  return { raw, query, day, rest };
}

const queryOf = (tokens: string[]): Normalized => {
  const text = tokens.join(" ");
  return { text, compact: compact(text), tokens };
};

/* ------------------------------------------------------- pages and actions --- */

interface Destination { id: string; label: string; detail: string; keywords: string; type: "page" | "action"; href: () => string }

const range = (preset: "7d" | "30d") => dateRangeForPreset(preset);

export const DESTINATIONS: Destination[] = [
  ...NAV.map(entry => ({ id: entry.id, label: entry.label, detail: "Page", keywords: entry.keywords, type: "page" as const, href: () => sectionHref(entry.id) })),
  { id: "maintenance", label: "Data maintenance", detail: "Page", keywords: "cleanup delete reset maintenance", type: "page", href: () => sectionHref("maintenance") },
  { id: "generate-report", label: "Generate report", detail: "Overview · PDF or Excel for a range and drivers", keywords: "report generate export pdf excel download summary", type: "action", href: () => sectionHref("overview", { report: "generate" }) },
  ...(Object.keys(EVIDENCE_KINDS) as EvidenceKind[]).map(kind => ({
    id: `evidence-${kind}`, label: EVIDENCE_KINDS[kind].label, detail: `Liability · ${EVIDENCE_KINDS[kind].title}`,
    keywords: { checkin: "storage container check in", checkout: "storage container check out collect", parking: "parking pcn restriction notice permit", liability: "damage incident liability report claim" }[kind],
    type: "action" as const, href: () => sectionHref("evidence", { kind })
  })),
  { id: "driver-directory", label: "Driver directory", detail: "Drivers · accounts and contact details", keywords: "driver list accounts directory contacts", type: "action", href: () => sectionHref("drivers", { view: "drivers", mode: "table" }) },
  { id: "driver-performance", label: "Driver performance", detail: "Drivers · last 7 days", keywords: "driver performance table delays", type: "action", href: () => sectionHref("drivers", { view: "performance" }) },
  { id: "vans-attention", label: "Vans needing attention", detail: "Van · MOT, tax or service due, last 30 days", keywords: "van vehicle mot tax insurance service due overdue attention compliance", type: "action", href: () => { const r = range("30d"); return sectionHref("vehicles", { show: "attention", from: r.from, to: r.to }); } },
  { id: "jobs-all", label: "All jobs", detail: "Jobs · every date", keywords: "bookings all jobs history", type: "action", href: () => sectionHref("jobs", { range: "all" }) },
  { id: "delivery-log", label: "Message delivery log", detail: "Alerts · SMS and email", keywords: "sms email delivery log messages", type: "action", href: () => sectionHref("alerts", { view: "delivery" }) },
  { id: "settings-pricing", label: "Pricing settings", detail: "Settings", keywords: "pricing rates prices", type: "action", href: () => sectionHref("settings", { tab: "pricing" }) },
  { id: "settings-templates", label: "Message templates", detail: "Settings", keywords: "templates sms email wording", type: "action", href: () => sectionHref("settings", { tab: "templates" }) }
];

export function searchDestinations(parts: QueryParts): SearchResult[] {
  const { query } = parts;
  if (!query.tokens.length) return [];
  const entries: Destination[] = isLogsQuery(parts.raw ?? query.text)
    ? [{ id: "logs", label: "Logs", detail: "Page", keywords: "", type: "page", href: () => sectionHref("logs") }]
    : DESTINATIONS;
  return entries.flatMap(entry => {
    const label = scoreRecord(query, [{ name: "label", value: entry.label, kind: "text" }]);
    // One letter matches labels only. A keyword hit is a suggestion, not a name
    // match, so it stays below real records.
    const keywords = !label && query.text.length >= 2 ? scoreRecord(query, [{ name: "label", value: entry.label, kind: "text" }, { name: "keywords", value: entry.keywords, kind: "text" }]) : null;
    const score = label ? label.score : keywords ? Math.min(keywords.score, TIER.substringText) : null;
    if (score === null) return [];
    return [{ type: entry.type, id: entry.id, label: entry.label, detail: entry.detail, target: { kind: "href" as const, href: entry.href() }, score }];
  });
}

/* --------------------------------------------------------------- drivers --- */

const REPORT_TAB_WORDS: Record<string, { tab: ReportTab; label: string }> = {
  report: { tab: "jobs", label: "Report" }, jobs: { tab: "jobs", label: "Jobs" },
  performance: { tab: "performance", label: "Performance & Timings" }, timings: { tab: "performance", label: "Performance & Timings" },
  payments: { tab: "payments", label: "Payments" }, comparison: { tab: "comparison", label: "Comparison" }, compare: { tab: "comparison", label: "Comparison" },
  tunnel: { tab: "tunnels", label: "Tunnel Charges" }, tunnels: { tab: "tunnels", label: "Tunnel Charges" }, congestion: { tab: "congestion", label: "Congestion Charges" }
};

export function driverFields(driver: AdminDriver): Field[] {
  return [
    { name: "initials", value: driver.initials, kind: "id" },
    { name: "name", value: driver.fullName, kind: "text" },
    { name: "van", value: driver.vanRegistration, kind: "id" },
    { name: "email", value: driver.email, kind: "text" }
  ];
}

const roster = (drivers: AdminDriver[]) => drivers.filter(driver => driver.initials && driver.initials !== "UNASSIGNED");

export function searchDrivers(parts: QueryParts, drivers: AdminDriver[]): SearchResult[] {
  const week = range("7d");
  const tabToken = parts.rest.find(token => REPORT_TAB_WORDS[token]);
  const nameTokens = parts.rest.filter(token => token !== tabToken);
  const results: SearchResult[] = [];
  for (const driver of roster(drivers)) {
    const fields = parts.query.text.length === 1 ? driverFields(driver).slice(0, 2) : driverFields(driver);
    const match = scoreRecord(parts.query, fields);
    const name = driver.fullName || driver.initials;
    if (match) {
      results.push({
        type: "driver", id: driver.initials, label: name,
        detail: [driver.initials, driver.vanRegistration ? formatVanReg(driver.vanRegistration) : "No van", driver.active ? "Active" : "Deactivated"].join(" · "),
        preview: [{ label: "Initials", value: driver.initials }, { label: "Van", value: driver.vanRegistration ? formatVanReg(driver.vanRegistration) : "Not assigned" }, { label: "Status", value: driver.active ? "Active" : "Deactivated" }],
        // A registration query is about the van: its own result ranks first.
        target: { kind: "href", href: driverReportHref(driver.initials, week.from, week.to) }, score: match.highlight?.field === "van" ? match.score - 50 : match.score
      });
    }
    // "Tiago congestion": the driver's report opened on that tab.
    if (tabToken && nameTokens.length) {
      const named = scoreRecord(queryOf(nameTokens), driverFields(driver).slice(0, 2));
      if (named) {
        const tab = REPORT_TAB_WORDS[tabToken];
        results.push({ type: "action", id: `report-${driver.initials}-${tab.tab}`, label: `${name} · ${tab.label}`, detail: "Driver report, last 7 days",
          target: { kind: "href", href: driverReportHref(driver.initials, week.from, week.to, tab.tab) }, score: named.score + 1 });
      }
    }
  }
  return results;
}

/** The driver a query names outright (by initials or a full first name), if any. */
export function namedDriver(tokens: string[], drivers: AdminDriver[]): { driver: AdminDriver; token: string } | null {
  for (const token of tokens) {
    const hits = roster(drivers).filter(driver => fold(driver.initials) === token || fold(driver.fullName).split(" ").includes(token));
    if (hits.length === 1) return { driver: hits[0], token };
  }
  return null;
}

/* ------------------------------------------------------- jobs, customers --- */

export interface JobRequest { q: string; driver?: string; from?: string; to?: string; verify: string[] }

const looksLikeReference = (token: string) => /\d/.test(token) && /[a-z]/.test(token) || /^tmv/.test(token);

/**
 * Turns a query into one bounded jobs request. A named driver becomes the driver
 * filter and a date becomes that London day; the most selective remaining token
 * (a reference, then a postcode, then the longest word) is the server's `q`. Every
 * other token is checked against each returned job, so "alex sw1a 1aa" must match both.
 */
export function jobRequest(parts: QueryParts, drivers: AdminDriver[]): JobRequest | null {
  let tokens = [...parts.rest];
  const named = tokens.length > 1 ? namedDriver(tokens, drivers) : null;
  if (named) tokens = tokens.filter(token => token !== named.token);
  const pick = tokens.find(looksLikeReference) ?? tokens.find(token => token.includes(" ")) ?? [...tokens].sort((a, b) => b.length - a.length)[0];
  if (!pick && !named && !parts.day) return null;
  if (pick && pick.replace(/\s/g, "").length < 2) return null;
  const day = parts.day as DateTime | null;
  return {
    q: pick ?? "", driver: named?.driver.initials,
    from: day ? day.toUTC().toISO()! : undefined, to: day ? day.endOf("day").toUTC().toISO()! : undefined,
    verify: tokens.filter(token => token !== pick)
  };
}

export function jobFields(job: NormalizedJob): Field[] {
  return [
    { name: "jobId", value: job.jobId, kind: "id" },
    { name: "customer", value: job.customerName, kind: "text" },
    { name: "pickup", value: job.pickup, kind: "text" },
    { name: "dropoff", value: job.dropoff, kind: "text" },
    { name: "driver", value: job.driverName, kind: "text" },
    { name: "initials", value: job.driverInitials, kind: "id" }
  ];
}

export function searchJobs(parts: QueryParts, request: JobRequest, jobs: NormalizedJob[]): SearchResult[] {
  const scored = request.q ? queryOf([request.q, ...request.verify]) : queryOf(request.verify);
  return jobs.flatMap(job => {
    let score: number;
    if (scored.tokens.length) {
      const match = scoreRecord(scored, jobFields(job));
      // The server matched the one token it was given on fields we may not hold (a
      // stored postcode form, say); keep it, ranked low. Extra tokens must all match.
      if (!match && (request.verify.length || !request.q)) return [];
      score = match?.score ?? TIER.substringText;
    } else score = TIER.prefixText; // driver and/or date only: every job returned fits.
    const when = job.bookedStart ? formatDate(job.bookedStart) : "Date not recorded";
    const status = jobStatusLabel(job.status);
    return [{
      type: "job" as const, id: job.jobId, label: `${job.jobId} · ${job.customerName || "Customer not recorded"}`,
      detail: `${when} · ${status} · ${job.driverName || "No driver"}`,
      preview: [{ label: "Reference", value: job.jobId }, { label: "Customer", value: job.customerName || "Not recorded" }, { label: "Date", value: when }, { label: "Status", value: status }, { label: "Driver", value: job.driverName || "Not assigned" }],
      target: { kind: "job" as const, jobId: job.jobId }, score
    }];
  });
}

/** Customers have no record of their own: they are the names on matching jobs. */
export function searchCustomers(parts: QueryParts, jobs: NormalizedJob[]): SearchResult[] {
  const groups = new Map<string, { name: string; jobs: NormalizedJob[]; score: number }>();
  const nameQuery = queryOf(parts.rest);
  for (const job of jobs) {
    if (!job.customerName) continue;
    // Only when the query names the customer, not when it matched a job reference.
    const match = scoreRecord(nameQuery, [{ name: "customer", value: job.customerName, kind: "text" }]);
    if (!match) continue;
    const key = fold(job.customerName);
    const group = groups.get(key) ?? { name: job.customerName, jobs: [], score: match.score };
    group.jobs.push(job);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const latest = group.jobs.map(job => job.bookedStart).filter(Boolean).sort().at(-1);
    return {
      type: "customer" as const, id: fold(group.name), label: group.name,
      detail: `${group.jobs.length} job${group.jobs.length === 1 ? "" : "s"} in these results${latest ? ` · latest ${formatDate(latest)}` : ""}`,
      preview: [{ label: "Customer", value: group.name }, { label: "Matching jobs", value: String(group.jobs.length) }, ...(latest ? [{ label: "Latest", value: formatDate(latest) }] : [])],
      target: { kind: "href" as const, href: sectionHref("jobs", { q: group.name, range: "all" }) }, score: group.score - 1
    };
  });
}

/* --------------------------------------------------------------- vehicles --- */

export const VAN_RANGE_PRESET = "30d" as const;

function complianceText(item?: VanDriverRecordItem | null): string {
  if (!item) return "No van records in the last 30 days";
  if (!item.compliance) return "Compliance not recorded";
  const due = vehicleAttention(item.compliance);
  return due.length ? due.map(entry => entry.label).join(", ") : "Nothing due";
}

/** Registrations from the roster and from van records, matched without spaces. */
export function searchVehicles(parts: QueryParts, drivers: AdminDriver[], records: VanDriverRecordItem[]): SearchResult[] {
  const vans = new Map<string, { reg: string; driver?: string; initials?: string; record?: VanDriverRecordItem }>();
  for (const driver of roster(drivers)) if (driver.vanRegistration) vans.set(compact(driver.vanRegistration), { reg: driver.vanRegistration, driver: driver.fullName, initials: driver.initials });
  for (const record of records) {
    if (!record.vanRegistration) continue;
    const key = compact(record.vanRegistration);
    vans.set(key, { ...vans.get(key), reg: record.vanRegistration, driver: record.driverName || vans.get(key)?.driver, initials: record.driverInitials || vans.get(key)?.initials, record });
  }
  const r = range(VAN_RANGE_PRESET);
  const short = parts.query.text.length === 1;
  return [...vans.entries()].flatMap(([key, van]) => {
    const match = scoreRecord(parts.query, [
      { name: "reg", value: formatVanReg(van.reg), kind: "id" }, { name: "compact", value: key, kind: "id" },
      ...(short ? [] : [{ name: "driver", value: van.driver, kind: "text" as const }])
    ]);
    if (!match) return [];
    // A registration match outranks the same driver's name match.
    const score = match.highlight?.field === "driver" ? match.score - 50 : match.score;
    const reg = formatVanReg(van.reg), status = complianceText(van.record);
    return [{
      type: "vehicle" as const, id: key, label: reg, detail: `${van.driver || "Driver not recorded"} · ${status}`,
      preview: [{ label: "Registration", value: reg }, { label: "Driver", value: van.driver || "Not recorded" }, { label: "Compliance", value: status }],
      target: { kind: "href" as const, href: sectionHref("vehicles", { from: r.from, to: r.to, q: key.toUpperCase(), vehicle: van.record?.id }) }, score
    }];
  });
}

/* -------------------------------------------------------------- liability --- */

export const LIABILITY_RANGE_PRESET = "30d" as const;

export function searchLiability(parts: QueryParts, kind: EvidenceKind, items: ScenarioItem[]): SearchResult[] {
  const r = range(LIABILITY_RANGE_PRESET);
  const meta = EVIDENCE_KINDS[kind];
  return items.flatMap(item => {
    const f = evidenceFields(item as Parameters<typeof evidenceFields>[0], kind);
    const match = scoreRecord(parts.query, [
      { name: "jobId", value: f.jobId, kind: "id" }, { name: "customer", value: f.customer, kind: "text" },
      { name: "driver", value: f.driver.name, kind: "text" }, { name: "initials", value: f.driver.code, kind: "id" },
      { name: "reference", value: f.reference, kind: "text" }, { name: "kind", value: meta.label, kind: "text" }
    ]);
    if (!match) return [];
    const when = f.at ? formatDateTime(f.at) : "Time not recorded";
    return [{
      type: "liability" as const, id: `${kind}:${item.id}`, label: `${meta.label} · ${f.customer || "Customer not recorded"}`,
      detail: [when, f.driver.name || "Driver not recorded", f.jobId].filter(Boolean).join(" · "),
      preview: [{ label: "Scenario", value: meta.title }, { label: "Customer", value: f.customer || "Not recorded" }, { label: "Driver", value: f.driver.name || "Not recorded" }, { label: "Submitted", value: when }, ...(f.jobId ? [{ label: "Job", value: f.jobId }] : [])],
      target: { kind: "href" as const, href: sectionHref("evidence", { kind, record: item.id, from: r.from, to: r.to }) },
      // A scenario word alone ("parking") belongs to the action, not every record.
      score: match.highlight?.field === "kind" ? TIER.fuzzy : match.score
    }];
  });
}

/* ----------------------------------------------------------------- alerts --- */

export function searchAlerts(parts: QueryParts, items: AttentionItem[]): SearchResult[] {
  if (parts.query.text.length < 2) return [];
  return items.flatMap(item => {
    const match = scoreRecord(parts.query, [
      { name: "title", value: item.title, kind: "text" }, { name: "detail", value: item.detail, kind: "text" },
      { name: "jobId", value: item.jobId, kind: "id" }, { name: "driver", value: item.driver, kind: "text" }, { name: "vehicle", value: item.vehicle, kind: "id" }
    ]);
    if (!match) return [];
    return [{
      type: "alert" as const, id: item.id, label: item.title, detail: item.detail,
      target: item.jobId ? { kind: "job" as const, jobId: item.jobId } : { kind: "href" as const, href: sectionHref("alerts") },
      score: Math.min(match.score, TIER.substringText)
    }];
  });
}

/** Destinations offered when nothing matches: related by type word, never as matches. */
export function fallbackDestinations(): SearchResult[] {
  const ids = new Set<string>(["jobs-all", "drivers", "vehicles", "evidence"]);
  return DESTINATIONS.filter(entry => ids.has(entry.id)).map(entry => ({ type: entry.type, id: entry.id, label: entry.label, detail: entry.detail, target: { kind: "href" as const, href: entry.href() }, score: 0 }));
}

