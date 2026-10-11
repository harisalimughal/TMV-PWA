import { log } from "./logger";

/**
 * Per-key async mutex.
 *
 * The Sheets write mutex orders *writes*, but a read-then-decide-then-write sequence
 * (START_JOB checking `actualStart`, the completion gate checking evidence) is not
 * protected by it: two double-tapped clicks both read the pre-write value and both
 * proceed. Wrapping the whole read/decide/write sequence in a per-job lock makes the
 * guard exclusive.
 *
 * Keyed rather than global so one driver's slow job never blocks another's.
 *
 * SCOPE: this is an in-process lock. It is correct at Cloud Run concurrency 1 with
 * max-instances 1 (see deploy/deploy.sh) and is the reason that deployment shape is
 * mandatory. Cross-instance mutual exclusion needs a transactional store.
 */
const locks = new Map<string, Promise<unknown>>();

export interface LockOptions {
  /** Fail rather than queue behind a stuck holder. */
  timeoutMs?: number;
}

export async function withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const previous = locks.get(key) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  locks.set(key, tail);

  const waitStarted = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      previous.catch(() => undefined),
      new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new Error(`Lock ${key} timed out`)), timeoutMs); })
    ]);
  } catch (error) {
    // A cancelled waiter still leaves its predecessor in control of the queue.
    release();
    void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const waited = Date.now() - waitStarted;
  if (waited > 250) log.debug("waited for job lock", { lock_key: key, waited_ms: waited });

  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  return withLock(`job:${jobId}`, fn);
}

/** Test helper. */
export function activeLockCount(): number {
  return locks.size;
}
