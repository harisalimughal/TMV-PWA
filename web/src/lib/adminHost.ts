/**
 * Which hostnames serve the admin dashboard.
 *
 * One bundle answers both the driver domain (chat.themanvan.co.uk) and the dashboard
 * domain. On an admin hostname the dashboard owns every path, including "/". On
 * `localhost` the admin is path-gated (`/admin`) so one dev server can show both apps.
 * Everywhere else, `/admin` is redirected to `/` before React mounts, so nothing renders
 * under a misleading URL.
 *
 * Production default: dashboard.themanvan.co.uk. To serve the admin from a staging or
 * preview host as well, build with VITE_ADMIN_HOSTNAMES="staging.example.com,other.example"
 * (comma-separated hostnames, added to the default, never replacing it; a scheme, port
 * or path typed by mistake is ignored).
 *
 * The Aurora dashboard (src/screens/admin) owns `/admin` on localhost and every path on
 * admin hosts. The classic dashboard (src/screens/admin-classic) used to live at `/temp`;
 * that URL is retired and redirects to "/" on every host. Its code is kept, unrouted.
 */
export const DEFAULT_ADMIN_HOSTNAMES = ["dashboard.themanvan.co.uk"] as const;

/** "https://Staging.Example.com:8443/admin" -> "staging.example.com" (hostnames only). */
function toHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
}

export function adminHostnames(extra: string | undefined = import.meta.env.VITE_ADMIN_HOSTNAMES): string[] {
  const configured = String(extra ?? "")
    .split(",")
    .map(toHostname)
    .filter(Boolean);
  return Array.from(new Set<string>([...DEFAULT_ADMIN_HOSTNAMES, ...configured]));
}

/**
 * Hostnames where the admin is path-gated (`/admin`) and the driver app owns
 * the rest, as on localhost. `localhost` is always included. A demo host that should show
 * all three products is added at build time with VITE_PATH_ADMIN_HOSTNAMES (same format
 * as VITE_ADMIN_HOSTNAMES).
 */
export function pathAdminHostnames(extra: string | undefined = import.meta.env.VITE_PATH_ADMIN_HOSTNAMES): string[] {
  const configured = String(extra ?? "")
    .split(",")
    .map(toHostname)
    .filter(Boolean);
  return Array.from(new Set<string>(["localhost", ...configured]));
}

const isAdminPath = (pathname: string) => pathname === "/admin" || pathname === "/admin/";

/** Retired path of the classic admin dashboard. Redirected to "/" on every host. */
export const RETIRED_CLASSIC_ADMIN_PATH = "/temp";
const isRetiredClassicPath = (pathname: string) => pathname === RETIRED_CLASSIC_ADMIN_PATH || pathname === `${RETIRED_CLASSIC_ADMIN_PATH}/`;

/** True when this location should mount the admin dashboard instead of the driver app. */
export function isAdminLocation(
  hostname: string,
  pathname: string,
  hosts: string[] = adminHostnames(),
  pathHosts: string[] = pathAdminHostnames()
): boolean {
  const host = hostname.toLowerCase();
  if (isRetiredClassicPath(pathname)) return false;
  return hosts.includes(host) || (pathHosts.includes(host) && isAdminPath(pathname));
}

/** True when `/admin` was opened on a host that does not serve the admin, or `/temp` anywhere (redirect to "/"). */
export function shouldRedirectAdminPath(
  hostname: string,
  pathname: string,
  hosts: string[] = adminHostnames(),
  pathHosts: string[] = pathAdminHostnames()
): boolean {
  const host = hostname.toLowerCase();
  if (isRetiredClassicPath(pathname)) return true;
  return isAdminPath(pathname) && !hosts.includes(host) && !pathHosts.includes(host);
}

/**
 * True while the admin dashboard is mounted: AdminApp puts `tmv-admin` on <html>.
 * Document-wide driver behaviour (themed tooltips, keyboard scroll-into-view, the
 * themed browser chrome in styles/chrome.css) stands down so the admin keeps its own.
 */
export function isAdminDocument(doc: Document | undefined = typeof document === "undefined" ? undefined : document): boolean {
  return doc?.documentElement.classList.contains("tmv-admin") ?? false;
}
