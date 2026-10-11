import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportReadCache, invalidateReportReads } from "../src/reports/report-read-cache";
afterEach(() => { vi.useRealTimers(); invalidateReportReads(); });
describe("Bounded report read cache", () => {
  it("coalesces concurrent/repeated reads, isolates filters and expires cached data", async () => {
    vi.useFakeTimers(); const cache = createReportReadCache<number>(100, 2), read = vi.fn().mockResolvedValue(1);
    expect(await Promise.all([cache.get("AB:today", read), cache.get("AB:today", read)])).toEqual([1, 1]);
    await cache.get("AB:today", read); expect(read).toHaveBeenCalledTimes(1);
    await cache.get("AB:yesterday", read); expect(read).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(101); await cache.get("AB:today", read); expect(read).toHaveBeenCalledTimes(3);
  });
  it("does not cache errors or large reports and bounds retained filters", async () => {
    const cache = createReportReadCache<number>(1000, 2, value => value < 100);
    const read = vi.fn().mockRejectedValueOnce(new Error("Synthetic failure")).mockResolvedValue(1);
    await expect(cache.get("a", read)).rejects.toThrow("Synthetic failure"); await cache.get("a", read);
    await cache.get("b", read); await cache.get("c", read); await cache.get("a", read); expect(read).toHaveBeenCalledTimes(5);
    const large = vi.fn().mockResolvedValue(100); await cache.get("large", large); await cache.get("large", large); expect(large).toHaveBeenCalledTimes(2);
  });
  it("invalidates pending reads without allowing old results to repopulate the cache", async () => {
    const cache = createReportReadCache<number>(); let release!: (value: number) => void;
    const old = cache.get("a", () => new Promise<number>(resolve => { release = resolve; }));
    await Promise.resolve(); invalidateReportReads();
    const fresh = vi.fn().mockResolvedValue(2); expect(await cache.get("a", fresh)).toBe(2);
    release(1); expect(await old).toBe(1); expect(await cache.get("a", fresh)).toBe(2); expect(fresh).toHaveBeenCalledTimes(1);
  });
});
