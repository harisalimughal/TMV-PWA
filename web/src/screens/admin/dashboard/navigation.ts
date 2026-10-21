/**
 * Admin routing: eight destinations (audit p.3), the routes reachable without a
 * sidebar entry, and the mapping from every legacy `?section=` value so existing
 * bookmarks and deep links keep working.
 *
 * URL state is scoped per page: switching section starts from a clean query string
 * (only the params a destination explicitly asks for), so one page's filters never
 * leak into another's. Within a page, filters live in the URL so Back/Forward and
 * reloads restore them.
 */
import type { LucideIcon } from "lucide-react";
import { Bell, CalendarCheck, ClipboardList, MessagesSquare, FileWarning, LayoutDashboard, Navigation as NavigationIcon, Settings, Truck, Users, ScrollText } from "lucide-react";

export type SectionId = "overview" | "bookings" | "jobs" | "activity" | "drivers" | "livefleet" | "vehicles" | "evidence" | "alerts" | "settings" | "logs";
export type RouteId = SectionId | "driverreport" | "maintenance";

export type NavGroupId = "operations" | "fleet" | "communication" | "system";
export interface NavEntry { id: SectionId; label: string; icon: LucideIcon; group: NavGroupId; shortcut?: string; keywords: string }

/** Sidebar sections, in order. Only destinations that exist are listed: Payments and Charges & reconciliation join when their screens do. */
export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: "operations", label: "Operations" },
  { id: "fleet", label: "Fleet management" },
  { id: "communication", label: "Communication" },
  { id: "system", label: "System" }
];

export const NAV: NavEntry[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "operations", shortcut: "O", keywords: "today summary attention dashboard home tmv" },
  { id: "bookings", label: "Bookings", icon: CalendarCheck, group: "operations", shortcut: "B", keywords: "enquiries quotes calendar dispatch schedule customers new booking" },
  { id: "jobs", label: "Jobs", icon: ClipboardList, group: "operations", shortcut: "J", keywords: "bookings moves finished completed" },
  { id: "activity", label: "Activity", icon: MessagesSquare, group: "operations", shortcut: "A", keywords: "chat messages driver conversation updates timeline inbox" },
  { id: "livefleet", label: "Live Fleet", icon: NavigationIcon, group: "operations", keywords: "map gps tracker live vans" },
  { id: "drivers", label: "Drivers", icon: Users, group: "fleet", shortcut: "D", keywords: "driver directory performance breakdown reports" },
  { id: "vehicles", label: "Van", icon: Truck, group: "fleet", keywords: "vehicles fuel service mot tax compliance" },
  { id: "evidence", label: "Liability", icon: FileWarning, group: "fleet", keywords: "checks check-in checkout parking liability incident" },
  { id: "alerts", label: "Notifications & Alerts", icon: Bell, group: "communication", keywords: "notifications delivery log sms email fleet events" },
  { id: "settings", label: "Settings", icon: Settings, group: "system", keywords: "configuration pricing rates message templates notifications" },
  { id: "logs", label: "Logs", icon: ScrollText, group: "system", keywords: "server errors problems issues history failures" }
];

export const ROUTE_TITLES: Record<RouteId, string> = {
  ...Object.fromEntries(NAV.map(entry => [entry.id, entry.label])) as Record<SectionId, string>,
  driverreport: "Driver report",
  maintenance: "Data maintenance"
};

const EVIDENCE_KINDS = ["checkin", "checkout", "parking", "liability"];

/** Which sidebar entry a route belongs to. */
export function navOwner(route: RouteId): SectionId | null {
  if (route === "driverreport") return "drivers";
  if (route === "maintenance") return null;
  return route;
}

export interface ResolvedRoute {
  route: RouteId;
  /** Present when the URL used a legacy name: the canonical query to replace it with. */
  canonical?: URLSearchParams;
}

/**
 * Maps the current query string to a route. Legacy names are translated to the new
 * destination *and* the view state they implied (e.g. `section=finished` -> Jobs with
 * the Completed filter, `section=messaging` -> Settings / Message templates).
 */
export function resolveRoute(search: string): ResolvedRoute {
  const params = new URLSearchParams(search);
  const section = params.get("section") || "";
  const canonical = (route: RouteId, set: Record<string, string> = {}, drop: string[] = []): ResolvedRoute => {
    const next = new URLSearchParams(params);
    next.set("section", route);
    for (const key of drop) next.delete(key);
    for (const [key, value] of Object.entries(set)) next.set(key, value);
    return { route, canonical: next };
  };

  switch (section) {
    case "settings":
      return params.get("tab") === "notifications" ? canonical("alerts", { view: "delivery" }, ["tab"]) : { route: "settings" };
    case "overview": case "bookings": case "jobs": case "activity": case "drivers": case "livefleet": case "vehicles": case "evidence": case "alerts":
    case "driverreport": case "maintenance": case "logs":
      return { route: section as RouteId };
    case "": return params.get("job") ? canonical("jobs") : { route: "overview" };
    case "finished": return canonical("jobs", { status: "completed" });
    case "van": return canonical("vehicles");
    case "liabilities": {
      const tab = params.get("liabilityTab");
      return canonical("evidence", tab && EVIDENCE_KINDS.includes(tab) ? { kind: tab } : {}, ["liabilityTab"]);
    }
    case "checkin": case "checkout": case "parking": case "liability":
      return canonical("evidence", { kind: section });
    case "notifications": {
      const tab = params.get("notificationsTab");
      return canonical("alerts", tab === "alerts" ? { view: "fleet" } : tab === "notifications" ? { view: "delivery" } : {}, ["notificationsTab"]);
    }
    case "configurations": case "pricing":
      return canonical("settings", { tab: params.get("configurationTab") === "messaging" ? "templates" : "pricing" }, ["configurationTab"]);
    case "messaging": return canonical("settings", { tab: "templates" }, ["configurationTab"]);
    case "finance": return canonical("overview");
    default: return canonical("overview");
  }
}

/** Builds a scoped href for a destination: only `section` plus explicit params. */
export function sectionHref(route: RouteId, params: Record<string, string | undefined> = {}): string {
  const next = new URLSearchParams({ section: route });
  for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
  return `${window.location.pathname}?${next.toString()}`;
}

/** Pushes a new admin URL and notifies listeners (pages read state on popstate). */
export function navigateTo(href: string, replace = false) {
  if (replace) window.history.replaceState(window.history.state, "", href);
  else window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Reads one query param from the live URL. */
export function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Replaces this page's own URL state in place (filters, tab, page). `null`/"" removes
 * a key; preserveEmpty retains explicit blanks for useUrlState's nonempty defaults.
 * Uses replaceState so typing in a search box doesn't create one history entry
 * per keystroke; pass `push` for discrete view changes the user may want to Back out of.
 */
export function updateUrlParams(values: Record<string, string | number | null | undefined>, push = false, preserveEmpty = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || (!preserveEmpty && value === "")) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  const href = url.pathname + url.search;
  if (href === window.location.pathname + window.location.search) return;
  if (push) navigateTo(href);
  else window.history.replaceState(window.history.state, "", href);
}

/* ------------------------------------------------------- job detail overlay --- */

/**
 * Opens the canonical job detail over whatever page is showing, by adding `job` to
 * the current URL. The page underneath never unmounts, so its filters, tab,
 * pagination and scroll position are exactly as they were when the drawer closes.
 */
export function openJob(jobId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("job", jobId);
  window.history.pushState({ jobOverlay: true }, "", url.pathname + url.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function closeJob() {
  if ((window.history.state as { jobOverlay?: boolean } | null)?.jobOverlay) {
    window.history.back();
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("job");
  url.searchParams.delete("reportReturn");
  navigateTo(url.pathname + url.search, true);
}
