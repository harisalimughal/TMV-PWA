import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env", () => ({
  env: { notificationFromName: "The Man Van" }
}));

import { geocodeAddress, reverseGeocode } from "../src/integrations/geocode";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("reverseGeocode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds a short place name from Nominatim's structured address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          address: { house_number: "56", road: "Bucklebury", suburb: "Tower Hamlets", city: "London" },
          display_name: "56, Bucklebury, Tower Hamlets, London, Greater London, England, E14, United Kingdom"
        })
      )
    );

    const name = await reverseGeocode(51.5074, -0.1278);
    expect(name).toBe("56 Bucklebury, Tower Hamlets");
    // Nominatim's usage policy requires an identifying User-Agent.
    const call = (fetch as any).mock.calls[0];
    expect(call[1].headers["User-Agent"]).toContain("TMV-PWA");
  });

  it("falls back to the first two parts of display_name when there's no structured address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ display_name: "Some Road, A District, A City, A Country" }))
    );

    const name = await reverseGeocode(1, 1);
    expect(name).toBe("Some Road, A District");
  });

  it("returns null (never throws) when Nominatim errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(reverseGeocode(1, 1)).resolves.toBeNull();
  });

  it("returns null (never throws) when the network call itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(reverseGeocode(1, 1)).resolves.toBeNull();
  });
});

describe("geocodeAddress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the first Nominatim search result as lat/lng", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ lat: "51.5394", lon: "-0.1027" }]))
    );

    const location = await geocodeAddress("7 Larch Close, London N1 7DP");

    expect(location).toEqual({ lat: 51.5394, lng: -0.1027 });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain("/search?");
    expect(call[1].headers["User-Agent"]).toContain("TMV-PWA");
  });

  it("returns null when Nominatim has no search result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    await expect(geocodeAddress("not a real address")).resolves.toBeNull();
  });
});
