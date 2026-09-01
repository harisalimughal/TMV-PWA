import { describe, it, expect } from "vitest";
import { initVapid, getVapidPublicKey } from "../src/push/vapid";

describe("Push Notification VAPID service", () => {
  it("generates and returns a valid VAPID public key", async () => {
    const publicKey = await getVapidPublicKey();
    expect(publicKey).toBeDefined();
    expect(typeof publicKey).toBe("string");
    expect(publicKey.length).toBeGreaterThan(20);
  });

  it("returns consistent cached VAPID keys on subsequent calls", async () => {
    const keys1 = await initVapid();
    const keys2 = await initVapid();
    expect(keys1.publicKey).toBe(keys2.publicKey);
    expect(keys1.privateKey).toBe(keys2.privateKey);
  });
});
