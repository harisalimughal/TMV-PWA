import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveFleetMap } from "./LiveFleetMap";
import type { NormalizedJob } from "../types";

const mocks = vi.hoisted(() => ({ tile: vi.fn(), fleet: { vehicles: [] as unknown[] } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: unknown[] }) => String(queryKey[0]).includes("zone")
  ? { data: { zones: [] }, isFetched: true, isLoading: false }
  : { data: mocks.fleet, isFetched: true, isLoading: false, isError: false, refetch: vi.fn(), dataUpdatedAt: Date.now() } }));

/** Every Leaflet call returns a chainable stub, so markers and popups can be created. */
function stub(): any {
  const target = () => proxy;
  const proxy: any = new Proxy(target, {
    get: (_obj, key) => key === "getZoom" ? () => 11 : key === "then" ? undefined : key === "getBounds" ? () => ({ isValid: () => false }) : (..._args: unknown[]) => proxy,
    apply: () => proxy
  });
  return proxy;
}
vi.mock("leaflet", () => ({ default: new Proxy({}, { get: (_obj, key) => key === "tileLayer" ? (...args: unknown[]) => { mocks.tile(...args); return stub(); } : () => stub() }) }));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const vehicle = (patch: Record<string, unknown>) => ({ imei: "1", name: "Van", plateNumber: "AB12 CDE", lat: 51.5, lng: -0.1, speedMph: 0, lastUpdate: minutesAgo(1),
  driverInitials: null, driverName: null, odometerMiles: null, ignitionOn: null, batteryVoltage: null, gpsSignalLevel: null, gsmSignalLevel: null, jammingDetected: false, ecoDrivingEvent: null, ...patch });

describe("LiveFleetMap", () => {
  it("has no single-option provider control and creates the tile layer once", () => {
    mocks.fleet = { vehicles: [] };
    render(<LiveFleetMap jobs={[]} />);
    expect(screen.queryByRole("combobox", { name: /provider/i })).not.toBeInTheDocument();
    expect(mocks.tile).toHaveBeenCalledOnce();
  });

  it("reports an old signal as stale and its motion as last known, not as parked", () => {
    mocks.fleet = { vehicles: [vehicle({ imei: "1", plateNumber: "OLD1", speedMph: 0, lastUpdate: minutesAgo(90) }), vehicle({ imei: "2", plateNumber: "NEW1", speedMph: 30, lastUpdate: minutesAgo(2) })] };
    render(<LiveFleetMap jobs={[]} />);
    expect(screen.getByRole("button", { name: /OLD1, Last known: stopped/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /NEW1, Moving/ })).toBeInTheDocument();
  });

  it("opens the exact current job for a vehicle's driver", () => {
    mocks.fleet = { vehicles: [vehicle({ imei: "3", plateNumber: "JOB1", driverInitials: "SD", driverName: "Sam Driver" })] };
    const onSelectJob = vi.fn();
    const job = { jobId: "TMV-42", driverInitials: "SD", status: "IN_PROGRESS", customerName: "Alex Sample" } as NormalizedJob;
    render(<LiveFleetMap jobs={[job]} onSelectJob={onSelectJob} />);
    fireEvent.click(screen.getByRole("button", { name: "View current job TMV-42 for Sam Driver" }));
    expect(onSelectJob).toHaveBeenCalledWith("TMV-42");
  });
});
