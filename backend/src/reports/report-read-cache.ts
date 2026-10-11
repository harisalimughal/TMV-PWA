const invalidators = new Set<() => void>();
export function invalidateReportReads() { for (const clear of invalidators) clear(); }

/** Small, process-local cache: failed reads and invalidated in-flight results are never retained. */
export function createReportReadCache<T>(ttlMs = 10_000, maxEntries = 12, retain: (value: T) => boolean = () => true) {
  const entries = new Map<string, { expires: number; value: T }>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;
  const clear = () => { generation++; entries.clear(); pending.clear(); };
  invalidators.add(clear);
  return {
    clear,
    async get(key: string, read: () => Promise<T>): Promise<T> {
      const now = Date.now();
      for (const [oldKey, entry] of entries) if (entry.expires <= now) entries.delete(oldKey);
      const cached = entries.get(key);
      if (cached) { entries.delete(key); entries.set(key, cached); return cached.value; }
      const existing = pending.get(key);
      if (existing) return existing;
      const revision = generation;
      const run = Promise.resolve().then(read);
      pending.set(key, run);
      try {
        const value = await run;
        if (revision === generation && retain(value)) {
          entries.set(key, { expires: Date.now() + ttlMs, value });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
        }
        return value;
      } finally { if (pending.get(key) === run) pending.delete(key); }
    }
  };
}
