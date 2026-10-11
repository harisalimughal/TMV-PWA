import { useState } from "react";
import { defaultDashboardDateRange } from "../components/DateRangePicker";

export interface ScenarioFilters {
  from?: string;
  to?: string;
  driverFilter: string;
  searchQuery: string;
}
export interface ScenarioFilterControl {
  value: ScenarioFilters;
  onChange: (patch: Partial<ScenarioFilters>) => void;
}
export const defaultScenarioFilters = (): ScenarioFilters => ({ ...defaultDashboardDateRange(), driverFilter: "", searchQuery: "" });

export function useScenarioFilters(control?: ScenarioFilterControl) {
  const [local, setLocal] = useState(defaultScenarioFilters);
  const update = (patch: Partial<ScenarioFilters>) => {
    if (control) control.onChange(patch);
    else setLocal(previous => ({ ...previous, ...patch }));
  };
  return { ...(control?.value ?? local),
    setFrom: (from?: string) => update({ from }), setTo: (to?: string) => update({ to }),
    setDriverFilter: (driverFilter: string) => update({ driverFilter }), setSearchQuery: (searchQuery: string) => update({ searchQuery }) };
}
