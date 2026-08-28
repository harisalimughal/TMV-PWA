import { SheetDataset } from "./types";
import { log } from "../utils/logger";

const DEFAULT_TTL_MS = 30_000;

class SheetCache {
  private data: SheetDataset | null = null;
  private cachedAt = 0;
  private isFetching = false;
  private fetchPromise: Promise<SheetDataset> | null = null;

  get ttlMs(): number {
    const fromEnv = Number(process.env.TMV_DASHBOARD_CACHE_TTL_MS);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_MS;
  }

  isFresh(): boolean {
    if (!this.data) return false;
    return Date.now() - this.cachedAt < this.ttlMs;
  }

  hasData(): boolean {
    return this.data !== null;
  }

  get(): SheetDataset | null {
    return this.data;
  }

  set(dataset: SheetDataset): void {
    this.data = dataset;
    this.cachedAt = Date.now();
  }

  invalidate(): void {
    this.cachedAt = 0;
  }

  async getOrFetch(fetcher: () => Promise<SheetDataset>, forceRefresh = false): Promise<SheetDataset> {
    const now = Date.now();

    if (forceRefresh) {
      this.invalidate();
    }

    // 1. Fresh cache hit -> return immediately (<1ms)
    if (this.data && !forceRefresh && (now - this.cachedAt < this.ttlMs)) {
      return this.data;
    }

    // 2. Stale cache hit -> return stale data immediately and kick off background fetch
    if (this.data && !forceRefresh) {
      if (!this.isFetching) {
        this.isFetching = true;
        fetcher()
          .then(fresh => {
            this.set(fresh);
            log.info("dashboard background cache revalidated", { duration_ms: fresh.durationMs });
          })
          .catch(err => {
            log.warn("dashboard background cache revalidation failed", { error: String(err) });
          })
          .finally(() => {
            this.isFetching = false;
          });
      }
      return this.data;
    }

    // 3. Cold start / Force refresh / No cache -> fetch and wait
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.isFetching = true;
    this.fetchPromise = fetcher()
      .then(fresh => {
        this.set(fresh);
        return fresh;
      })
      .finally(() => {
        this.isFetching = false;
        this.fetchPromise = null;
      });

    return this.fetchPromise;
  }
}

export const sheetCache = new SheetCache();
