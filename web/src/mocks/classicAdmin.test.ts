import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "./handlers";
import { handleClassicAdmin, resetClassicAdmin } from "./classicAdmin";

const call = (method: string, path: string, search = "", body?: unknown) =>
  handleClassicAdmin(method, path, search, body === undefined ? undefined : JSON.stringify(body));

describe("classic admin mock handlers", () => {
  beforeEach(() => {
    resetStore();
    resetClassicAdmin();
  });

  it("ignores non-API paths", async () => {
    expect(await call("GET", "/temp")).toBeNull();
  });

  it("serves van records with search and pagination from the query string", async () => {
    const all = (await call("GET", "/api/admin/van/drivers", "?page=1"))?.body as any;
    expect(all.items.length).toBeGreaterThan(4);
    expect(all.pagination.total).toBe(all.items.length);
    const one = (await call("GET", "/api/admin/van/drivers", "?q=lk19"))?.body as any;
    expect(one.items.map((v: any) => v.vanRegistration)).toEqual(["LK19 XRT"]);
  });

  it("saves compliance so the next list reflects it", async () => {
    const res = await call("POST", "/api/admin/van/compliance/LK19%20XRT", "", { motExpiryDate: "2030-01-01", serviceIntervalMiles: 9000 });
    expect(res?.status).toBe(200);
    const list = (await call("GET", "/api/admin/van/drivers", "?q=lk19"))?.body as any;
    expect(list.items[0].compliance).toMatchObject({ motExpiryDate: "2030-01-01", serviceIntervalMiles: 9000 });
  });

  it("merges its pricing settings with the shared liability categories setting", async () => {
    const settings = ((await call("GET", "/api/admin/settings"))?.body as any).settings;
    expect(settings.map((s: any) => s.key)).toEqual(
      expect.arrayContaining(["CREW_RATE_2_MAN", "PACKING_RATE", "FIRETEXT_API_KEY", "LIABILITY_DAMAGE_CATEGORIES"])
    );
    expect((await call("POST", "/api/admin/settings", "", { key: "PACKING_RATE", value: "35" }))?.status).toBe(200);
    expect((await call("POST", "/api/admin/settings", "", { key: "TUNNEL_CHARGE", value: "999" }))?.status).toBe(500);
  });

  it("leaves liability categories and malformed saves to the shared handler", async () => {
    expect(await call("POST", "/api/admin/settings", "", { key: "LIABILITY_DAMAGE_CATEGORIES", value: "Scratch" })).toBeNull();
    expect(await handleClassicAdmin("POST", "/api/admin/settings", "", "not json")).toBeNull();
  });

  it("serves message templates", async () => {
    const items = ((await call("GET", "/api/admin/messages"))?.body as any).items;
    expect(items.some((m: any) => m.audience === "customer")).toBe(true);
    expect(items.some((m: any) => m.audience === "driver")).toBe(true);
  });

  it("falls through for endpoints it does not know", async () => {
    expect(await call("GET", "/api/jobs/10231")).toBeNull();
  });
});
