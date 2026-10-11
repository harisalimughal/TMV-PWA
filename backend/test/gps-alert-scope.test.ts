import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/config/env", () => ({ env: { gpsTimeoutMs: 1000 } }));
vi.mock("../src/config/live-settings", () => ({ getGpsApiKey: async () => "test-key" }));
import { fetchGpsLiveAlertsForFleet } from "../src/integrations/gpslive";
const read = vi.fn();
beforeEach(() => { read.mockReset(); vi.stubGlobal("fetch", read); });
afterEach(() => vi.unstubAllGlobals());
const response = (data: unknown) => ({ ok: true, json: async () => data });
describe("Tracker-scoped GPS alert history", () => {
  it("queries historical assignments directly without fetching the current fleet", async () => {
    read.mockResolvedValue(response([{ event_id: "event" }]));
    await fetchGpsLiveAlertsForFleet("FROM", "TO", ["OLD", "CURRENT", "OLD"]);
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0][0]).toBe("https://api.gpslive.app/v1/alerts/custom");
    expect(JSON.parse(read.mock.calls[0][1].body).imeis).toEqual(["OLD", "CURRENT"]);
  });
  it("preserves the full fleet feed when no historical scope was supplied", async () => {
    read.mockResolvedValueOnce(response([{ imei: "ONE" }, { imei: "TWO" }])).mockResolvedValueOnce(response([]));
    await fetchGpsLiveAlertsForFleet("FROM", "TO");
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).toBe("https://api.gpslive.app/v1/devices/list");
    expect(JSON.parse(read.mock.calls[1][1].body).imeis).toEqual(["ONE", "TWO"]);
  });
  it("does not turn an explicitly empty scope into a fleet query", async () => {
    expect(await fetchGpsLiveAlertsForFleet("FROM", "TO", [])).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
