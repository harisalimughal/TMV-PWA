import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveFleetMap } from "./LiveFleetMap";

const mocks = vi.hoisted(() => ({ tile: vi.fn(), zoom: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { vehicles: [], zones: [] }, isFetched: true, isLoading: false }) }));
vi.mock("leaflet", () => ({ default: {
  map: () => ({ remove: vi.fn(), on: vi.fn(), off: vi.fn(), removeLayer: vi.fn(), invalidateSize: vi.fn(), getZoom: () => 11, setZoom: mocks.zoom }),
  tileLayer: (...args: unknown[]) => { mocks.tile(...args); return { addTo: vi.fn() }; }
} }));

describe("Live Fleet map provider", () => {
  it("offers only OpenStreetMap and creates its tile layer once", () => {
    render(<LiveFleetMap jobs={[]} />);
    const provider = screen.getByRole("combobox", { name: "Map provider" });
    expect(within(provider).getAllByRole("option").map(option => option.textContent)).toEqual(["OpenStreetMap"]);
    expect(provider).toHaveValue("osm");
    expect(mocks.tile).toHaveBeenCalledOnce();
    expect(mocks.tile.mock.calls[0][0]).toBe("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(screen.queryByText(/Voyager|Positron/)).not.toBeInTheDocument();
  });
});
