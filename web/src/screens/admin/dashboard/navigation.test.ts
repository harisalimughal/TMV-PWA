import { describe, expect, it } from "vitest";
import { NAV, resolveRoute, navOwner } from "./navigation";

const canonical = (search: string) => Object.fromEntries(resolveRoute(search).canonical ?? []);

describe("information architecture", () => {
  it("has exactly the ten destinations, in order", () => {
    expect(NAV.map(entry => entry.label)).toEqual(["Overview", "Bookings", "Jobs", "Activity", "Live Fleet", "Drivers", "Van", "Liability", "Notifications & Alerts", "Settings"]);
  });
  it("keeps the driver report under Drivers", () => {
    expect(navOwner("driverreport")).toBe("drivers");
    expect(navOwner("maintenance")).toBeNull();
  });
});

describe("resolveRoute", () => {
  it("passes canonical sections through untouched", () => {
    for (const section of ["overview", "bookings", "jobs", "activity", "drivers", "livefleet", "vehicles", "evidence", "alerts", "settings", "driverreport", "maintenance"]) {
      expect(resolveRoute(`?section=${section}`)).toEqual({ route: section });
    }
  });

  it.each([
    ["?section=finished&q=smith", "jobs", { section: "jobs", status: "completed", q: "smith" }],
    ["?section=van", "vehicles", { section: "vehicles" }],
    ["?section=liabilities&liabilityTab=parking", "evidence", { section: "evidence", kind: "parking" }],
    ["?section=liabilities", "evidence", { section: "evidence" }],
    ["?section=checkout", "evidence", { section: "evidence", kind: "checkout" }],
    ["?section=notifications&notificationsTab=alerts", "alerts", { section: "alerts", view: "fleet" }],
    ["?section=notifications&notificationsTab=notifications", "alerts", { section: "alerts", view: "delivery" }],
    ["?section=configurations&configurationTab=messaging", "settings", { section: "settings", tab: "templates" }],
    ["?section=pricing", "settings", { section: "settings", tab: "pricing" }],
    ["?section=messaging", "settings", { section: "settings", tab: "templates" }]
  ])("maps legacy %s", (search, route, query) => {
    expect(resolveRoute(search).route).toBe(route);
    expect(canonical(search)).toEqual(query);
  });

  it("sends the removed Finance destination and unknown names to Overview instead of a blank page", () => {
    expect(resolveRoute("?section=finance").route).toBe("overview");
    expect(resolveRoute("?section=nope").route).toBe("overview");
    expect(canonical("?section=nope")).toEqual({ section: "overview" });
  });

  it("opens a bare job link inside Jobs", () => {
    expect(resolveRoute("?job=TMV-1").route).toBe("jobs");
    expect(canonical("?job=TMV-1")).toEqual({ section: "jobs", job: "TMV-1" });
  });
});
