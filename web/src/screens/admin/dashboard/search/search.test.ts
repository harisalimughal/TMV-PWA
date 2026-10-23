import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { AdminDriver } from "../../../../api/admin";
import type { NormalizedJob, ScenarioItem, VanDriverRecordItem } from "../types";
import { compact, editDistance, fold, highlightParts, matchField, normalizeQuery, scoreRecord, TIER } from "./searchCore";
import { DESTINATIONS, fallbackDestinations, jobRequest, parseQuery, rankResults, searchCustomers, searchDestinations, searchDrivers, searchJobs, searchLiability, searchVehicles } from "./providers";
import { clearSearchHistory, recentItems, recentQueries, rememberQuery, rememberResult } from "./history";

const driver = (initials: string, fullName: string, vanRegistration = "", active = true): AdminDriver =>
  ({ initials, fullName, vanRegistration, active, email: "", phone: "", role: "driver", hasPassword: true, lastLoginAt: null });
// The stored roster: initials are not derived from names (Caio is KA).
const ROSTER = [driver("AR", "Aragao"), driver("KA", "Caio", "AB12CDE"), driver("HE", "Henrique"), driver("MK", "Maico"), driver("PL", "Paulo"),
  driver("RF", "Rafael", "EF56GHJ"), driver("TI", "Tiago", "CD34EFG"), driver("WD", "Wander"), driver("UNASSIGNED", "Unassigned")];

const drivers = (q: string) => rankResults(searchDrivers(parseQuery(q), ROSTER)).filter(result => result.type === "driver").map(result => result.id);

describe("normalisation", () => {
  it("folds case, accents and spacing, and compacts identifiers", () => {
    expect(fold("  Amégée   SMITH ")).toBe("amegee smith");
    expect(compact("YC68 VJZ")).toBe("yc68vjz");
    expect(normalizeQuery(" Rm18  Tiago ").tokens).toEqual(["rm18", "tiago"]);
  });

  it("matches identifiers whatever their separators", () => {
    expect(matchField("yc68vjz", { name: "reg", value: "YC68 VJZ", kind: "id" })?.score).toBe(TIER.exactId);
    expect(matchField("489f", { name: "id", value: "TMV-489FDAB633", kind: "id" })?.score).toBe(TIER.wordPrefix);
    expect(matchField("tmv489f", { name: "id", value: "TMV-489FDAB633", kind: "id" })?.score).toBe(TIER.substringId);
  });

  it("tolerates one typo in longer names only", () => {
    expect(editDistance("henrqiue", "henrique")).toBe(1);
    expect(editDistance("hnerqiue", "henrique")).toBe(2);
    expect(matchField("tiaog", { name: "n", value: "Tiago", kind: "text" })?.score).toBe(TIER.fuzzy);
    expect(matchField("rafeal", { name: "n", value: "Rafael", kind: "text" })?.score).toBe(TIER.fuzzy);
    expect(matchField("rfaeal", { name: "n", value: "Rafael", kind: "text" })).toBeNull();
    expect(matchField("rafae", { name: "n", value: "Rafael", kind: "text" })?.score).toBe(TIER.prefixText);
    expect(matchField("tia", { name: "n", value: "Maria", kind: "text" })).toBeNull();
  });

  it("requires every word of a multi-word query", () => {
    const fields = [{ name: "reg", value: "RM18 ABC", kind: "id" as const }, { name: "driver", value: "Tiago", kind: "text" as const }];
    expect(scoreRecord(normalizeQuery("rm18 tiago"), fields)).not.toBeNull();
    expect(scoreRecord(normalizeQuery("rm18 caio"), fields)).toBeNull();
  });

  it("highlights safely as plain text parts", () => {
    expect(highlightParts("Tiago <b>", normalizeQuery("ti"))).toEqual([{ text: "Ti", hit: true }, { text: "ago <b>", hit: false }]);
    expect(highlightParts("Message templates", normalizeQuery("t"))).toEqual([{ text: "Message ", hit: false }, { text: "t", hit: true }, { text: "emplates", hit: false }]);
  });
});

describe("drivers", () => {
  it("T: Tiago (prefix of name and initials)", () => expect(drivers("T")).toEqual(["TI"]));
  it("TI: Tiago by exact initials first", () => expect(drivers("TI")[0]).toBe("TI"));
  it("KA: Caio by stored initials, not derived from the name", () => expect(drivers("KA")).toEqual(["KA"]));
  it("HE: Henrique", () => expect(drivers("HE")[0]).toBe("HE"));
  it("RF: Rafael", () => expect(drivers("rf")[0]).toBe("RF"));
  it("WD: Wander", () => expect(drivers("WD")).toEqual(["WD"]));
  it("never offers the UNASSIGNED placeholder", () => expect(drivers("un")).toEqual([]));
  it("a van registration finds its driver", () => expect(drivers("AB12")).toEqual(["KA"]));
  it("'Tiago congestion' offers the report on the Congestion tab", () => {
    const action = searchDrivers(parseQuery("tiago congestion"), ROSTER).find(result => result.type === "action");
    expect(action?.label).toBe("Tiago · Congestion Charges");
    expect(action?.target).toMatchObject({ kind: "href" });
    expect((action!.target as { href: string }).href).toContain("reportTab=congestion");
  });
  it("opens the driver's report", () => {
    const result = searchDrivers(parseQuery("caio"), ROSTER)[0];
    expect((result.target as { href: string }).href).toMatch(/section=driverreport&driver=KA/);
  });
});

const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({ jobId: "TMV-1", customerName: "", pickup: "", dropoff: "", driverName: "", driverInitials: "", bookedStart: "2026-10-13T09:00:00Z", status: "READY", ...patch } as NormalizedJob);
const JOBS = [
  job({ jobId: "TMV-489FDAB633", customerName: "Alex Sample", pickup: "1 Example Street, SW1A 1AA", dropoff: "2 Sample Road, E8 2EJ", driverName: "Tiago", driverInitials: "TI" }),
  job({ jobId: "TMV-77AA0000", customerName: "Alex Other", pickup: "9 Test Lane, N1 1AA", dropoff: "3 Mock Way", driverName: "Caio", driverInitials: "KA", bookedStart: "2026-10-10T09:00:00Z" })
];

describe("jobs and customers", () => {
  it("a partial reference goes to the server as q and opens the exact job", () => {
    const parts = parseQuery("489F");
    const request = jobRequest(parts, ROSTER)!;
    expect(request.q).toBe("489f");
    const results = searchJobs(parts, request, JOBS.slice(0, 1));
    expect(results[0].target).toEqual({ kind: "job", jobId: "TMV-489FDAB633" });
  });

  it("driver + reference: the driver becomes a filter", () => {
    const request = jobRequest(parseQuery("tiago 489f"), ROSTER)!;
    expect(request).toMatchObject({ q: "489f", driver: "TI", verify: [] });
  });

  it("customer + date: the date becomes that London day", () => {
    const request = jobRequest(parseQuery("alex 13 oct", DateTime.fromISO("2026-10-16T10:00", { zone: "Europe/London" })), ROSTER)!;
    expect(request.q).toBe("alex");
    expect(request.from).toBe("2026-10-12T23:00:00.000Z");
    expect(request.to).toBe("2026-10-13T22:59:59.999Z");
  });

  it("postcode + customer: the postcode is the server query and the name is verified", () => {
    const parts = parseQuery("alex sw1a 1aa");
    const request = jobRequest(parts, ROSTER)!;
    expect(request).toMatchObject({ q: "sw1a 1aa", verify: ["alex"] });
    expect(searchJobs(parts, request, JOBS).map(result => result.id)).toEqual(["TMV-489FDAB633"]);
  });

  it("customers come from matching jobs, grouped by name, and link to a Jobs search", () => {
    const customers = searchCustomers(parseQuery("alex sample"), JOBS);
    expect(customers.map(result => result.label)).toEqual(["Alex Sample"]);
    expect((customers[0].target as { href: string }).href).toContain("section=jobs&q=Alex+Sample&range=all");
    expect(searchCustomers(parseQuery("489f"), JOBS)).toEqual([]);
  });

  it("missing customer names are shown as missing, not invented", () => {
    const results = searchJobs(parseQuery("tmv-1"), jobRequest(parseQuery("tmv-1"), ROSTER)!, [job({})]);
    expect(results[0].label).toBe("TMV-1 · Customer not recorded");
  });
});

describe("vehicles", () => {
  const record = { id: "rec-1", vanRegistration: "YC68VJZ", driverName: "Tiago", driverInitials: "TI", compliance: null } as unknown as VanDriverRecordItem;
  const vans = (q: string) => searchVehicles(parseQuery(q), ROSTER, [record]);
  it("YC68 and YC68VJZ and 'yc68 vjz' all find the van", () => {
    for (const q of ["YC68", "YC68VJZ", "yc68 vjz"]) expect(vans(q).map(result => result.label)).toEqual(["YC68 VJZ"]);
  });
  it("opens the exact van record and says when compliance is not recorded", () => {
    const [van] = vans("yc68vjz");
    expect((van.target as { href: string }).href).toContain("vehicle=rec-1");
    expect(van.detail).toContain("Compliance not recorded");
  });
  it("a registration ranks the van above its driver", () => {
    const ranked = rankResults([...searchDrivers(parseQuery("cd34"), ROSTER), ...vans("cd34")]);
    expect(ranked[0]).toMatchObject({ type: "vehicle", label: "CD34 EFG" });
  });
  it("roster vans without records are still found", () => expect(vans("CD34").map(result => result.label)).toEqual(["CD34 EFG"]));
});

describe("liability", () => {
  const item = { id: "rec-9", clientName: "Drew Sample", driverName: "Rafael", driverInitials: "RF", jobId: "TMV-1003", timestamp: "2026-10-14T09:00:00Z", address: "3 Example Street", photos: [] } as unknown as ScenarioItem;
  it("finds a record by customer and links to its scenario and record", () => {
    const [result] = searchLiability(parseQuery("drew"), "parking", [item]);
    expect(result.label).toBe("Parking Liability · Drew Sample");
    expect((result.target as { href: string }).href).toMatch(/section=evidence&kind=parking&record=rec-9/);
  });
  it("a scenario word alone ranks the action above every record", () => {
    const ranked = rankResults([...searchDestinations(parseQuery("parking")), ...searchLiability(parseQuery("parking"), "parking", [item])]);
    expect(ranked[0]).toMatchObject({ type: "action", id: "evidence-parking" });
  });
});

describe("suggestions and ranking", () => {
  it("keeps Logs out of general destinations, fallback suggestions and non-exact results", () => {
    expect(DESTINATIONS.some(entry => entry.id === "logs")).toBe(false);
    expect(fallbackDestinations().some(entry => entry.id === "logs")).toBe(false);
    for (const query of ["", "log", "logging", "errors", "system", "server logs", "lògs"]) expect(searchDestinations(parseQuery(query)).some(entry => entry.id === "logs")).toBe(false);
    expect(searchDestinations(parseQuery(" LOGS "))).toEqual([expect.objectContaining({ id: "logs", target: { kind: "href", href: `${window.location.pathname}?section=logs` } })]);
  });
  it("'Driver' suggests Drivers, 'Report' Generate report, 'Parking' Parking Liability", () => {
    expect(rankResults(searchDestinations(parseQuery("driver")))[0].label).toBe("Drivers");
    expect(rankResults(searchDestinations(parseQuery("report")))[0].label).toBe("Generate report");
    expect(rankResults(searchDestinations(parseQuery("parking")))[0].label).toBe("Parking Liability");
  });
  it("dedupes by type and id and breaks ties deterministically", () => {
    const base = { target: { kind: "href" as const, href: "/" }, score: 700 };
    const ranked = rankResults([{ type: "page", id: "a", label: "B", ...base }, { type: "page", id: "a", label: "B", ...base, score: 900 }, { type: "driver", id: "x", label: "Z", ...base }]);
    expect(ranked.map(result => `${result.type}:${result.id}:${result.score}`)).toEqual(["page:a:900", "driver:x:700"]);
  });
  it("ranks a few thousand records quickly", () => {
    const many = Array.from({ length: 3000 }, (_, index) => driver(`D${index}`, `Driver ${index} Example`, `AB${index}XYZ`));
    const started = performance.now();
    searchDrivers(parseQuery("example 12"), many);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe("history", () => {
  it("never persists a Logs destination or exact Logs query into suggestions", () => {
    clearSearchHistory();
    rememberResult({ type: "page", id: "logs", label: "Logs", target: { kind: "href", href: "/admin?section=logs" }, score: 1 });
    rememberQuery(" LOGS ");
    expect(recentItems()).toEqual([]);
    expect(recentQueries()).toEqual([]);
  });
  it("keeps ids and short labels only, never customers, and clears", () => {
    clearSearchHistory();
    rememberResult({ type: "job", id: "TMV-1", label: "TMV-1 · Alex Sample", target: { kind: "job", jobId: "TMV-1" }, score: 1 });
    rememberResult({ type: "customer", id: "alex sample", label: "Alex Sample", target: { kind: "href", href: "/" }, score: 1 });
    expect(recentItems()).toEqual([{ type: "job", id: "TMV-1", label: "TMV-1", target: { kind: "job", jobId: "TMV-1" } }]);
    rememberQuery("alex");
    expect(recentQueries()).toEqual(["alex"]);
    expect(window.localStorage.getItem("tmv:admin-search-queries")).toBeNull();
    clearSearchHistory();
    expect(recentItems()).toEqual([]);
    expect(recentQueries()).toEqual([]);
  });
});
