import { describe, expect, it } from "vitest";
import { handleAdmin } from "./admin";

describe("admin mock API (dev visual QA only)", () => {
  it("refuses push sends instead of pretending to deliver them", async () => {
    const res = await handleAdmin("POST", "/api/push/admin/broadcast", "", JSON.stringify({ title: "t", body: "b" }));
    expect(res?.status).toBe(503);
  });
  it("filters jobs by the query string", async () => {
    const all = await handleAdmin("GET", "/api/admin/jobs", "?pageSize=500", undefined);
    const done = await handleAdmin("GET", "/api/admin/jobs", "?pageSize=500&status=COMPLETED", undefined);
    const items = (body: unknown) => (body as { items: Array<{ status: string }> }).items;
    expect(items(done!.body).every(job => job.status === "COMPLETED")).toBe(true);
    expect(items(done!.body).length).toBeLessThan(items(all!.body).length);
  });
  it("lists the real roster by name and code and invents no contact details", async () => {
    const res = await handleAdmin("GET", "/api/admin/drivers", "", undefined);
    const drivers = (res!.body as { drivers: Array<{ initials: string; fullName: string; email: string; phone: string }> }).drivers;
    expect(drivers.map(driver => `${driver.fullName} (${driver.initials})`)).toEqual([
      "Aragao (AR)", "Caio (KA)", "Henrique (HE)", "Maico (MK)", "MAN VAN (MA)", "Paulo (PL)", "Rafael (RF)", "Tiago (TI)", "Wander (WD)"
    ]);
    for (const driver of drivers) { expect(driver.email).toBe(""); expect(driver.phone).toBe(""); }
  });
});
