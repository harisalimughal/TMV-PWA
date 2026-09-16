import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "../api";
import { LiveFleetMap } from "../components/LiveFleetMap";

interface Props {
  onSelectSection?: (id: string) => void;
}

export function LiveFleetPage({ onSelectSection }: Props) {
  const { data: jobsData } = useQuery({
    queryKey: ["live_fleet_jobs"],
    queryFn: () => fetchJobs({ status: "IN_PROGRESS", limit: 50 }),
    refetchInterval: 10000
  });

  const activeJobs = jobsData?.items || [];

  return (
    <div className="space-y-4 max-w-full">
      {/* The map component carries its own status line (live count, filters); the
          separate banner that used to sit here was pure vertical cost. */}
      <LiveFleetMap
        jobs={activeJobs}
        onSelectJob={_jobId => {
          if (onSelectSection) onSelectSection("jobs");
        }}
      />
    </div>
  );
}
