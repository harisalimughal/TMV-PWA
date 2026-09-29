import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivers as fetchDriverRoster, type AdminDriver } from "../../../../api/admin";

export const DRIVER_OPTIONS_QUERY_KEY = ["admin_driver_options"] as const;

export interface DriverOption {
  initials: string;
  fullName: string;
  active: boolean;
}

function toDriverOptions(drivers: AdminDriver[]): DriverOption[] {
  return drivers
    .filter(d => d.initials && d.initials !== "UNASSIGNED")
    .map(d => ({
      initials: d.initials,
      fullName: d.fullName,
      active: d.active
    }))
    .sort((a, b) => (a.fullName || a.initials).localeCompare(b.fullName || b.initials));
}

export function useDriverOptions() {
  const query = useQuery({
    queryKey: DRIVER_OPTIONS_QUERY_KEY,
    queryFn: fetchDriverRoster,
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000
  });

  const options = useMemo(() => toDriverOptions(query.data ?? []), [query.data]);

  return {
    ...query,
    options
  };
}
