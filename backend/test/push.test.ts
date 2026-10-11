import { describe, it, expect, vi } from "vitest";
const settings = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/db/settings.repo", () => ({ getSetting: async (key: string, fallback: string) => settings.get(key) ?? fallback,
  setSetting: async (key: string, value: string) => { settings.set(key, value); } }));
import { initVapid, getVapidPublicKey } from "../src/push/vapid";

describe("Push Notification VAPID service", () => {
  it("generates and returns a valid VAPID public key", async () => {
    const publicKey = await getVapidPublicKey();
    expect(publicKey).toBeDefined();
    expect(typeof publicKey).toBe("string");
    expect(publicKey.length).toBeGreaterThan(20);
    expect(settings.get("vapid_public_key")).toBe(publicKey);
  });

  it("returns consistent cached VAPID keys on subsequent calls", async () => {
    const keys1 = await initVapid();
    const keys2 = await initVapid();
    expect(keys1.publicKey).toBe(keys2.publicKey);
    expect(keys1.privateKey).toBe(keys2.privateKey);
  });
});
