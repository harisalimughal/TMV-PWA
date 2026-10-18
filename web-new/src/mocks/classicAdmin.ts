/**
 * Dev mock data for the classic admin at /temp (src/screens/admin-classic), as it was in
 * its original app: adminRecords (drivers, vans, settings, messages, reports) and
 * adminDispatch (the Dispatch board). install.ts tries this first on /temp, then falls
 * back to the Aurora mocks (admin.ts) and the shared store (handlers.ts). Both admins
 * call the same /api/admin endpoints in production.
 */
import { handle, type MockResponse } from "./handlers";
import { handleAdminRecords, handleAdminRecordsAsync, resetAdminRecords, saveMockSetting, settingsList } from "./adminRecords";
import { handleAdminDispatch } from "./adminDispatch";

export { resetAdminRecords as resetClassicAdmin };

export async function handleClassicAdmin(method: string, path: string, search: string, bodyText?: string): Promise<MockResponse | null> {
  if (!path.startsWith("/api/")) return null;
  const query = new URLSearchParams(search);

  // Pricing, API keys and message settings live in adminRecords; the liability
  // categories setting stays in the shared store, so a save there shows up in both admins.
  if (path === "/api/admin/settings" && method === "GET") {
    const base = handle(method, path, bodyText, search);
    const shared = ((base?.body as { settings?: unknown[] } | undefined)?.settings ?? []);
    return { status: 200, body: { settings: [...settingsList(), ...shared] } };
  }
  if (path === "/api/admin/settings" && method === "POST") {
    let key = "";
    let value = "";
    try {
      const parsed = JSON.parse(bodyText ?? "{}") as { key?: unknown; value?: unknown };
      key = String(parsed.key ?? "");
      value = String(parsed.value ?? "");
    } catch {
      /* fall through to the shared handler, which answers the bad request */
    }
    if (key && key !== "LIABILITY_DAMAGE_CATEGORIES") return saveMockSetting(key, value);
    return null;
  }

  return (
    (await handleAdminRecordsAsync(method, path, query)) ??
    handleAdminRecords(method, path, bodyText, query) ??
    handleAdminDispatch(method, path, query)
  );
}
