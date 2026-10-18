import { describe, expect, it, vi } from "vitest";
// Regression: the demo Activity data once depended on the London time of day (CI failed after midnight).
describe.each(["2026-10-16T23:31:00Z", "2026-10-17T00:05:00Z", "2026-10-17T03:10:00Z", "2026-10-17T08:30:00Z", "2026-10-17T12:00:00Z", "2026-10-17T21:55:00Z"])("at %s", at => {
  it("shows all nine drivers and some unread", async () => {
    vi.resetModules(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(at));
    const { handleAdmin } = await import("./admin");
    const r: any = await handleAdmin("GET", "/api/admin/activity/conversations", "?limit=200", undefined);
    const have = new Set(r.body.items.map((i: any) => i.driver.initials));
    for (const d of ["AR", "KA", "HE", "MK", "MA", "PL", "RF", "TI", "WD"]) expect(have.has(d), d).toBe(true);
    expect(r.body.items.some((i: any) => i.unreadCount > 0)).toBe(true);
    vi.useRealTimers();
  });
});
