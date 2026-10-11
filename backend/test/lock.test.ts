import { describe, expect, it } from "vitest";
import { activeLockCount, withLock } from "../src/utils/lock";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("Job/driver queue serialization", () => {
  it("keeps later requests queued while the third overlapping request holds the key", async () => {
    const a = deferred(), b = deferred(), c = deferred();
    const entered: number[] = [];
    const first = withLock("driver-concurrent", async () => { entered.push(1); await a.promise; });
    const second = withLock("driver-concurrent", async () => { entered.push(2); await b.promise; });
    const third = withLock("driver-concurrent", async () => { entered.push(3); await c.promise; });
    await tick(); a.release(); await first; await tick();
    expect(entered).toEqual([1, 2]);
    b.release(); await second; await tick();
    const fourth = withLock("driver-concurrent", async () => { entered.push(4); });
    await tick();
    expect(entered).toEqual([1, 2, 3]);
    c.release(); await Promise.all([third, fourth]);
    expect(entered).toEqual([1, 2, 3, 4]);
    expect(activeLockCount()).toBe(0);
  });

  it("does not free an active holder when a queued request times out", async () => {
    const hold = deferred();
    let nextEntered = false;
    const first = withLock("driver-timeout", () => hold.promise);
    await expect(withLock("driver-timeout", async () => { throw new Error("Cancelled waiter ran"); }, { timeoutMs: 5 })).rejects.toThrow("timed out");
    const next = withLock("driver-timeout", async () => { nextEntered = true; });
    await tick();
    expect(nextEntered).toBe(false);
    hold.release(); await Promise.all([first, next]);
    expect(nextEntered).toBe(true);
    expect(activeLockCount()).toBe(0);
  });

  it("releases a failed holder so subsequent requests can continue", async () => {
    const failure = withLock("driver-failed", async () => { throw new Error("Save failed"); });
    const following = withLock("driver-failed", async () => "continued");
    await expect(failure).rejects.toThrow("Save failed");
    await expect(following).resolves.toBe("continued");
    expect(activeLockCount()).toBe(0);
  });
});
