import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localNotificationSamples, seedLocalNotificationSamples } from "../../../test/localNotificationSamples";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../../api/auth", () => ({ fetchSession: mocks.session }));
beforeEach(() => mocks.session.mockReset().mockResolvedValue({ initials: "MA" }));
afterEach(() => vi.unstubAllGlobals());

describe("Local MA notification samples", () => {
  it("includes short and long complete messages without persistent alert banners", () => {
    const rows = localNotificationSamples(1000);
    expect(rows).toHaveLength(2);
    expect(rows[0].body).toContain("SHORT TEST END");
    expect(rows[1].body).toContain("LONG TEST END");
    expect(rows[1].body.length).toBeGreaterThan(1000);
    expect(rows.every(row => !row.read && row.dismissed && row.receivedAt === 1000)).toBe(true);
  });
  it("does not write notification storage for another account", async () => {
    const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
    mocks.session.mockResolvedValue({ initials: "WD" });
    await expect(seedLocalNotificationSamples()).rejects.toThrow("Sign in as MA");
    expect(open).not.toHaveBeenCalled();
  });
  it("adds only missing samples and preserves existing notification history", async () => {
    const old = { id: 1, title: "Existing notification", receivedAt: Date.now() };
    const rows: any[] = [old];
    const close = vi.fn();
    const db = { close, transaction: () => {
      const tx: any = { objectStore: () => ({ getAll: () => {
        const req: any = { result: [...rows] };
        queueMicrotask(() => { req.onsuccess(); queueMicrotask(() => tx.oncomplete()); });
        return req;
      }, add: (value: unknown) => rows.push(value) }) };
      return tx;
    } };
    const open = vi.fn(() => { const req: any = { result: db }; queueMicrotask(() => req.onsuccess()); return req; });
    vi.stubGlobal("indexedDB", { open });
    expect(await seedLocalNotificationSamples()).toBe(2);
    expect(await seedLocalNotificationSamples()).toBe(0);
    expect(rows).toHaveLength(3); expect(rows[0]).toBe(old);
    expect(close).toHaveBeenCalledTimes(2);
  });
});
