import { describe, expect, it, vi } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import type { DriverReport } from "../driverReport.types";
import { compareJobs, combinedSummary, formatValue, jobLine, loadDriverJobReport, loadSection, reportFileName, reportStatus, retryFailedDrivers, summaryLines, totalJobs, type JobLine } from "./driverJobReport";
import { customRange } from "./reportPeriods";

const withSummary = (report: DriverReport, patch: Partial<DriverReport["summary"]>): DriverReport => ({ ...report, summary: { ...report.summary, ...patch } });
const line = (lines: ReturnType<typeof summaryLines>, key: string) => lines.find(item => item.key === key)!;

const week = customRange("2026-10-05", "2026-10-11") as { from: string; to: string };
const twoDays = customRange("2026-10-05", "2026-10-06") as { from: string; to: string };
/** The fixture, with a small page size so paging is exercised. */
const paged = vi.fn((initials: string, query: Record<string, string | number>) => sampleDriverReport(initials, { ...query, pageSize: 10 }));

describe("driver job report data", () => {
  it("asks the backend for the selected driver and London range, and reads every job page", async () => {
    paged.mockClear();
    const { section } = await loadSection("KA", week, undefined, paged);
    expect(paged.mock.calls.every(([initials]) => initials === "KA")).toBe(true);
    expect(paged.mock.calls[0][1]).toMatchObject({ from: week.from, jobsPage: 1, detail: "core" });
    expect(paged).toHaveBeenCalledTimes(4); // 36 jobs, 10 per page
    expect(section.jobs).toHaveLength(36);
    expect(section.jobTotal).toBe(36);
    expect(new Set(section.jobs.map(job => job.jobId)).size).toBe(36);
    expect(section.driver.initials).toBe("KA");
  });

  it("takes every total from the backend summary, unchanged", async () => {
    const report = await sampleDriverReport("RF", { from: week.from, to: week.to, pageSize: 100 });
    const lines = Object.fromEntries(summaryLines(report).map(line => [line.key, line.value]));
    expect(lines.assigned).toBe(report.summary.assignedJobs);
    expect(lines.completed).toBe(report.summary.completedJobs);
    expect(lines.working).toBe(report.summary.workingMinutesKnown);
    expect(lines.reported).toBe(report.summary.manualMinutesKnown);
    expect(lines.final).toBe(report.summary.paymentCards?.driverCollectionPence);
    expect(lines.receipts).toBe(report.summary.systemKnownCollectionsPence);
    expect(lines.manual).toBe(report.summary.paymentCards?.manualEntriesKnownPence ?? report.summary.paymentCards?.manualEntriesPence);
    expect(lines.outstanding).toBe(report.summary.paymentCards?.outstandingPence);
  });

  it("keeps per-job values separate and missing ones missing", async () => {
    const report = await sampleDriverReport("RF", { from: week.from, to: week.to, pageSize: 100 });
    const job = report.jobs.items[0];
    const line = jobLine({ ...job, duration: { ...job.duration, workingMinutes: null }, manualDetails: null, customer: { name: "Not recorded" } });
    expect(line.workingMinutes).toBeNull();
    expect(line.manualEntryPence).toBeNull();
    expect(line.customer).toBeNull();
    expect(line.finalChargePence).toBe(job.finance.acceptedPence);
    expect(line.scheduledMinutes).toBe(job.duration.bookedMinutes);
    expect(line.date).toBe("2026-10-05");
    expect(line.bookedTime).toBe("10:00"); // 09:00 UTC is 10:00 BST
    expect(formatValue(null, "pence")).toBe("Not available");
    expect(formatValue(36500, "pence")).toBe("£365.00");
    expect(formatValue(297, "minutes")).toBe("4h 57m");
  });

  it("builds one section per driver and combines totals without counting a job twice", async () => {
    const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: paged, now: () => new Date("2026-10-15T09:00:00Z") });
    expect(report.sections.map(section => section.driver.initials)).toEqual(["KA", "RF"]);
    expect(report.generatedAt).toBe("2026-10-15T09:00:00.000Z");
    const combined = combinedSummary(report)!;
    const per = report.sections.map(section => section.summary.find(line => line.key === "assigned")!.value!);
    expect(combined.find(line => line.key === "assigned")!.value).toBe(per[0] + per[1]);
    expect(totalJobs(report)).toBe(report.sections[0].jobTotal + report.sections[1].jobTotal);
    expect(reportFileName(report, "xlsx")).toBe("tmv-driver-jobs-drivers-2026-10-05-to-2026-10-06.xlsx");
  });

  it("makes a combined total missing when any driver's value is missing", async () => {
    const withGap = async (initials: string, query: Record<string, string | number>): Promise<DriverReport> => {
      const report = await sampleDriverReport(initials, query);
      return initials === "RF" ? { ...report, summary: { ...report.summary, paymentCards: { ...report.summary.paymentCards!, outstandingPence: null } } } : report;
    };
    const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: withGap });
    expect(combinedSummary(report)!.find(line => line.key === "outstanding")!.value).toBeNull();
  });

  it("returns an empty section, not invented rows, for a driver with no jobs", async () => {
    const report = await loadDriverJobReport(["PL"], customRange("2026-09-01", "2026-09-02") as { from: string; to: string }, { load: paged });
    expect(report.sections[0].jobs).toEqual([]);
    expect(report.sections[0].jobTotal).toBe(0);
    expect(combinedSummary(report)).toBeNull();
    expect(reportFileName(report, "pdf")).toBe("tmv-driver-jobs-PL-2026-09-01-to-2026-09-02.pdf");
  });

  it("warns when the list is cut short", async () => {
    const short = async (initials: string, query: Record<string, string | number>) => {
      const report = await sampleDriverReport(initials, { ...query, pageSize: 5 });
      return { ...report, jobs: { ...report.jobs, items: query.jobsPage === 1 ? report.jobs.items : [] } };
    };
    const { section } = await loadSection("KA", week, undefined, short);
    expect(section.jobs).toHaveLength(5);
    expect(section.warnings[0]).toBe("Only the first 5 of 36 jobs are listed. Totals still cover every job.");
  });

  describe("financial availability", () => {
    it("keeps a missing invoice figure missing, not £0.00", async () => {
      const base = await sampleDriverReport("RF", { from: week.from, to: week.to, pageSize: 100 });
      const { Invoice: _omit, ...withoutInvoice } = base.summary.systemPaymentsByMethodPence;
      const lines = summaryLines(withSummary({ ...base, summary: { ...base.summary, financialBreakdown: undefined } }, { systemPaymentsByMethodPence: withoutInvoice }));
      expect(line(lines, "invoices")).toMatchObject({ value: null, coverage: "unavailable" });
      expect(formatValue(line(lines, "invoices").value, "pence")).toBe("Not available");
      expect(line(lines, "invoices").note).toMatch(/Not provided by the server/);
      const noMap = summaryLines(withSummary({ ...base, summary: { ...base.summary, financialBreakdown: undefined } }, { systemPaymentsByMethodPence: undefined as never }));
      expect(line(noMap, "invoices").value).toBeNull();
    });

    it("keeps an explicit zero as £0.00, and an explicit count of zero invoice jobs counts as zero", async () => {
      const base = await sampleDriverReport("RF", { from: week.from, to: week.to, pageSize: 100 });
      const explicit = summaryLines(withSummary(base, { systemPaymentsByMethodPence: { ...base.summary.systemPaymentsByMethodPence, Invoice: 0 } }));
      expect(line(explicit, "invoices")).toMatchObject({ value: 0, coverage: "complete" });
      expect(formatValue(0, "pence")).toBe("£0.00");
      const { Invoice: _omit, ...without } = base.summary.systemPaymentsByMethodPence;
      const counted = summaryLines(withSummary({ ...base, summary: { ...base.summary, financialBreakdown: { basePence: null, invoiceJobs: 0, extraCharges: [] } } }, { systemPaymentsByMethodPence: without }));
      expect(line(counted, "invoices")).toMatchObject({ value: 0, coverage: "complete" });
    });

    it("marks totals built from only some jobs as known-only, and complete ones as complete", async () => {
      const base = await sampleDriverReport("RF", { from: week.from, to: week.to, pageSize: 100 });
      const partial = summaryLines(withSummary(base, { workingMinutesUnknownJobs: 3, unknownSystemCollectionJobs: 0 }));
      expect(line(partial, "working").coverage).toBe("known-only");
      const complete = summaryLines(withSummary(base, { workingMinutesUnknownJobs: 0 }));
      expect(line(complete, "working").coverage).toBe("complete");
    });

    const dropInvoice = (report: DriverReport): DriverReport => {
      const { Invoice: _omit, ...rest } = report.summary.systemPaymentsByMethodPence;
      return { ...report, summary: { ...report.summary, financialBreakdown: undefined, systemPaymentsByMethodPence: rest } };
    };
    const gap = async (initials: string, query: Record<string, string | number>) => { const report = await sampleDriverReport(initials, query); return initials === "RF" ? dropInvoice(report) : report; };

    it("does not present a total with an unavailable part as complete; the known subtotal is kept apart", async () => {
      const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: gap });
      const invoices = line(combinedSummary(report)!, "invoices");
      const ka = line(report.sections[0].summary, "invoices").value!;
      expect(invoices).toMatchObject({ value: null, coverage: "unavailable", knownSubtotal: ka });
      expect(invoices.note).toMatch(/Known subtotal .* from 1 of 2 drivers; the complete total is not available/);
      // Other measures, with a value in every section, still combine.
      expect(line(combinedSummary(report)!, "assigned").coverage).toBe("complete");
    });
  });

  describe("partial loads", () => {
    it("keeps the drivers that loaded, lists the ones that failed, and makes the combined totals unavailable", async () => {
      const flaky = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query);
      const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: flaky, continueOnError: true });
      expect(report.sections.map(section => section.driver.initials)).toEqual(["KA"]);
      expect(report.failed).toEqual([{ initials: "RF", message: "Server busy", attempts: 1 }]);
      expect(report.notes?.[0]).toMatch(/Not loaded because the request failed: RF/);
      expect(combinedSummary(report)!.every(item => item.value === null)).toBe(true);
    });

    it("still rejects when every driver fails, and by default on the first failure", async () => {
      const down = () => Promise.reject(new Error("Down"));
      await expect(loadDriverJobReport(["KA", "RF"], twoDays, { load: down, continueOnError: true })).rejects.toThrow("Down");
      await expect(loadDriverJobReport(["KA"], twoDays, { load: down })).rejects.toThrow("Down");
    });

    it("never swallows a cancellation", async () => {
      const abort = new AbortController();
      const cancelled = () => { abort.abort(); return Promise.reject(new DOMException("Aborted", "AbortError")); };
      await expect(loadDriverJobReport(["KA", "RF"], twoDays, { load: cancelled, continueOnError: true, signal: abort.signal })).rejects.toThrow();
    });
  });

  describe("resilient loading", () => {
    const calls = () => { const log: string[] = []; return { log, load: (initials: string, query: Record<string, string | number>) => { log.push(`${initials}:${query.jobsPage}`); return sampleDriverReport(initials, query); } }; };

    it("keeps every driver that loaded when one fails, and reports each driver's own state", async () => {
      const events: Array<[string, string]> = [];
      const flaky = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query);
      const report = await loadDriverJobReport(["KA", "RF", "PL"], twoDays, { load: flaky, continueOnError: true, onDriver: event => events.push([event.initials, event.kind]) });
      expect(report.sections.map(section => section.driver.initials)).toEqual(["KA", "PL"]);
      expect(report.failed?.map(item => item.initials)).toEqual(["RF"]);
      expect(events).toEqual(expect.arrayContaining([["KA", "pending"], ["KA", "loading"], ["KA", "success"], ["RF", "failed"], ["PL", "success"]]));
    });

    it("tells a driver with no jobs (empty, a valid result) apart from one that failed", async () => {
      const report = await loadDriverJobReport(["PL"], customRange("2026-09-01", "2026-09-02") as { from: string; to: string }, { load: paged });
      expect(report.failed).toBeUndefined();
      expect(report.sections[0].jobTotal).toBe(0);
      expect(reportStatus(report).status).toBe("EMPTY");
    });

    it("never runs more than the concurrency limit at once, and keeps the drivers in the order asked", async () => {
      let running = 0, peak = 0;
      const slow = async (initials: string, query: Record<string, string | number>) => { running++; peak = Math.max(peak, running); await new Promise(resolve => setTimeout(resolve, 5)); running--; return sampleDriverReport(initials, query); };
      const drivers = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];
      const report = await loadDriverJobReport(drivers, twoDays, { load: slow, concurrency: 3 });
      expect(peak).toBeLessThanOrEqual(3);
      expect(peak).toBeGreaterThan(1);
      expect(report.sections.map(section => section.driver.initials)).toEqual(drivers.map(code => report.sections.find(section => section.driver.initials === code)?.driver.initials).filter(Boolean));
    });

    it("retries only the drivers that failed, keeps the others untouched, and adds no job twice", async () => {
      let fail = true;
      const log: string[] = [];
      const flaky = (initials: string, query: Record<string, string | number>) => { log.push(initials); return initials === "RF" && fail ? Promise.reject(new Error("Server busy")) : sampleDriverReport(initials, query); };
      const first = await loadDriverJobReport(["KA", "RF"], twoDays, { load: flaky, continueOnError: true });
      expect(first.failed).toHaveLength(1);
      const kaSection = first.sections[0];
      log.length = 0; fail = false;
      const second = await retryFailedDrivers(first, { load: flaky });
      expect(new Set(log)).toEqual(new Set(["RF"]));             // KA was not requested again
      expect(second.failed).toBeUndefined();
      expect(second.sections.map(section => section.driver.initials)).toEqual(["KA", "RF"]);
      expect(second.sections[0]).toBe(kaSection);                 // the loaded section is reused as is
      expect(reportStatus(second).status).toBe("COMPLETE");
      expect(second.notes).toEqual([]);
      const ids = second.sections.map(section => section.jobs.map(job => job.jobId));
      for (const list of ids) expect(new Set(list).size).toBe(list.length);
      // Retrying a report with nothing failed does nothing.
      expect(await retryFailedDrivers(second, { load: flaky })).toBe(second);
    });

    it("counts attempts, and a driver that fails again stays failed without losing the others", async () => {
      const down = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("Still down")) : sampleDriverReport(initials, query);
      const first = await loadDriverJobReport(["KA", "RF"], twoDays, { load: down, continueOnError: true });
      const again = await retryFailedDrivers(first, { load: down });
      expect(again.failed).toEqual([{ initials: "RF", message: "Still down", attempts: 2 }]);
      expect(again.sections.map(section => section.driver.initials)).toEqual(["KA"]);
      expect(reportStatus(again).status).toBe("PARTIAL");
    });

    it("keeps 'All drivers' semantics through a retry: drivers with no jobs stay out and are named", async () => {
      let fail = true;
      const load = (initials: string, query: Record<string, string | number>) => initials === "RF" && fail ? Promise.reject(new Error("busy")) : sampleDriverReport(initials, initials === "PL" ? { ...query, from: "2026-09-01", to: "2026-09-02" } : query);
      const first = await loadDriverJobReport(["KA", "PL", "RF"], twoDays, { load, continueOnError: true, dropEmpty: true });
      expect(first.empty?.map(item => item.initials)).toEqual(["PL"]);
      fail = false;
      const second = await retryFailedDrivers(first, { load });
      expect(second.empty?.map(item => item.initials)).toEqual(["PL"]);
      expect(second.sections.map(section => section.driver.initials)).toEqual(["KA", "RF"]);
      expect(second.notes?.some(note => /No jobs in this period: .*PL/.test(note))).toBe(true);
    });

    it("a cancelled load rejects and does not start the remaining drivers", async () => {
      const abort = new AbortController();
      const { log, load } = calls();
      const cancelling = (initials: string, query: Record<string, string | number>) => { if (log.length >= 2) abort.abort(); return load(initials, query); };
      await expect(loadDriverJobReport(["A", "B", "C", "D", "E", "F", "G", "H"], twoDays, { load: cancelling, signal: abort.signal, concurrency: 1, continueOnError: true })).rejects.toBeTruthy();
      expect(new Set(log.map(entry => entry.split(":")[0])).size).toBeLessThan(8);
    });

    it("does not request more pages than the server's own page size needs", async () => {
      const { log, load } = calls();
      await loadSection("KA", week, undefined, (initials, query) => load(initials, { ...query, pageSize: 10 }));
      expect(log).toEqual(["KA:1", "KA:2", "KA:3", "KA:4"]);   // 36 jobs, 10 per page
    });
  });

  describe("job records", () => {
    it("drops rows repeated by overlapping pages, keeps the first, and says the list may be incomplete", async () => {
      const overlap = async (initials: string, query: Record<string, string | number>) => {
        const report = await sampleDriverReport(initials, { ...query, pageSize: 10 });
        const page = Number(query.jobsPage ?? 1);
        // Page 2 starts two rows early, as when rows were inserted between requests.
        if (page === 2) { const all = (await sampleDriverReport(initials, { ...query, pageSize: 100, jobsPage: 1 })).jobs.items; return { ...report, jobs: { ...report.jobs, items: all.slice(8, 18) } }; }
        return report;
      };
      const { section } = await loadSection("KA", week, undefined, overlap);
      const ids = section.jobs.map(job => job.jobId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(section.duplicates).toBe(2);
      expect(section.warnings.some(warning => /2 repeated rows were removed.*some jobs may be missing/.test(warning))).toBe(true);
      expect(section.warnings.some(warning => /^Only the first/.test(warning))).toBe(true);
    });

    it("keeps the same job under two drivers: it is a separate assignment, not a duplicate", async () => {
      const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: paged });
      const shared = report.sections[0].jobs[0].jobId;
      expect(report.sections[1].jobs.some(job => job.jobId === shared)).toBe(true);
      expect(totalJobs(report)).toBe(report.sections[0].jobTotal + report.sections[1].jobTotal);
    });

    it("leaves unreadable records out, counts them, and marks the report partial instead of inventing jobs", async () => {
      const broken = async (initials: string, query: Record<string, string | number>) => {
        const report = await sampleDriverReport(initials, query);
        const items: unknown[] = [...report.jobs.items.slice(0, 3), { jobId: "" , status: "COMPLETED", finance: {}, duration: {} }, { status: "COMPLETED" }, null, { jobId: "X1", status: "COMPLETED", finance: null, duration: {} }];
        return { ...report, jobs: { ...report.jobs, items: items as never, total: 3 } };
      };
      const { section } = await loadSection("KA", week, undefined, broken);
      expect(section.jobs).toHaveLength(3);
      expect(section.rejected).toBe(4);
      const report = await loadDriverJobReport(["KA"], week, { load: broken });
      expect(reportStatus(report).status).toBe("PARTIAL");
      expect(reportStatus(report).reasons.join(" ")).toMatch(/4 unreadable server records/);
    });

    it("fails a driver, not the dashboard, when the response is not a driver report", async () => {
      const bad = () => Promise.resolve({ nonsense: true } as never);
      await expect(loadSection("KA", week, undefined, bad)).rejects.toThrow(/unexpected shape/);
      const report = await loadDriverJobReport(["KA", "RF"], twoDays, { load: (initials, query) => initials === "RF" ? bad() : sampleDriverReport(initials, query), continueOnError: true });
      expect(report.failed?.[0]).toMatchObject({ initials: "RF" });
    });

    it("turns a non-numeric money or time field into missing, never 0", async () => {
      const base = await sampleDriverReport("KA", { from: week.from, to: week.to, pageSize: 100 });
      const job = base.jobs.items[0];
      const line = jobLine({ ...job, finance: { ...job.finance, acceptedPence: "12" as never }, duration: { ...job.duration, workingMinutes: NaN } });
      expect(line.finalChargePence).toBeNull();
      expect(line.workingMinutes).toBeNull();
    });
  });

  describe("job order", () => {
    const at = (jobId: string, date: string | null, bookedTime: string | null) => ({ jobId, date, bookedTime }) as JobLine;
    it("puts dated jobs in time order, undated jobs last, and breaks ties by job id", () => {
      const jobs = [at("TMV-2", null, null), at("TMV-10", "2026-10-05", "09:00"), at("TMV-1", "2026-10-05", "09:00"), at("TMV-3", "2026-10-04", "23:30"), at("TMV-9", null, null)];
      expect(jobs.sort(compareJobs).map(job => job.jobId)).toEqual(["TMV-3", "TMV-1", "TMV-10", "TMV-2", "TMV-9"]);
    });
    it("reads dates in London time, so a late evening UTC job is on the next London day", async () => {
      const base = await sampleDriverReport("KA", { from: week.from, to: week.to, pageSize: 100 });
      const job = base.jobs.items[0];
      expect(jobLine({ ...job, bookedStart: "2026-07-01T23:30:00Z" })).toMatchObject({ date: "2026-07-02", bookedTime: "00:30" });
      expect(jobLine({ ...job, bookedStart: "2026-12-01T23:30:00Z" })).toMatchObject({ date: "2026-12-01", bookedTime: "23:30" });
    });
    it("treats an invalid date as undated rather than inventing one", async () => {
      const base = await sampleDriverReport("KA", { from: week.from, to: week.to, pageSize: 100 });
      const line = jobLine({ ...base.jobs.items[0], bookedStart: "not a date" });
      expect(line.date).toBeNull();
      expect(line.bookedTime).toBeNull();
    });
  });

  describe("large reports", () => {
    it("reads 950 jobs in exactly 10 requests, in order, without repeats, and caps one driver at 1000", async () => {
      const template = await sampleDriverReport("KA", { from: week.from, to: week.to, pageSize: 100 });
      const make = (count: number) => Array.from({ length: count }, (_, index) => ({ ...template.jobs.items[index % template.jobs.items.length], jobId: `TMV-${String(index).padStart(5, "0")}`, bookedStart: new Date(Date.UTC(2026, 9, 5, 8) + index * 60_000).toISOString() }));
      const server = (count: number) => { const all = make(count); const log: number[] = []; return { log, load: async (_i: string, query: Record<string, string | number>) => { const page = Number(query.jobsPage), size = Number(query.pageSize); log.push(page); return { ...template, jobs: { items: all.slice((page - 1) * size, page * size), total: count, page, pageSize: size } }; } }; };
      const small = server(950);
      const { section } = await loadSection("KA", week, undefined, small.load);
      expect(small.log).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(section.jobs).toHaveLength(950);
      expect(new Set(section.jobs.map(job => job.jobId)).size).toBe(950);
      expect(section.jobs.map(job => job.jobId)).toEqual([...section.jobs.map(job => job.jobId)].sort());
      const big = server(1500);
      const capped = await loadSection("KA", week, undefined, big.load);
      expect(big.log).toHaveLength(10);
      expect(capped.section.jobs).toHaveLength(1000);
      expect(capped.section.warnings[0]).toMatch(/Only the first 1000 of 1500 jobs are listed/);
      expect(reportStatus({ title: "t", range: week, generatedAt: "", sources: [], sections: [capped.section] }).status).toBe("PARTIAL");
    });
  });
});
