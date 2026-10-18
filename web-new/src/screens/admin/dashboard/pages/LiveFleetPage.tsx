/**
 * Live Fleet: the coordinated map + vehicle list. "View job" opens the exact job that
 * vehicle's driver is working (previously the job ID was discarded and only the Jobs
 * list opened -- audit p.20). The job opens over this page, so the map position and
 * selected vehicle are still there when it closes; the selection is also kept in the
 * URL. Monitoring only -- no dispatch or nearby-job suggestions.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "../api";
import { LiveFleetMap } from "../components/LiveFleetMap";
import { openJob, updateUrlParams, urlParam } from "../navigation";
import { Notice, PageHeader } from "../components/ds";
import { TRACKER_STALE_AFTER_MINUTES } from "../utils/freshness";

export function LiveFleetPage() {
  const jobs = useQuery({ queryKey: ["live_fleet_jobs"], queryFn: () => fetchJobs({ status: "IN_PROGRESS", limit: 50, pageSize: 50 }), refetchInterval: 10000 });
  return (
    <>
      <PageHeader title="Live Fleet" scope={`Positions refresh every 10 seconds · a signal older than ${TRACKER_STALE_AFTER_MINUTES} minutes is marked stale and shows only the last known state`} />
      {jobs.isError && <Notice tone="warning">In-progress jobs couldn't be loaded, so vehicles can't show their current job right now. Positions are unaffected.</Notice>}
      <LiveFleetMap jobs={jobs.data?.items ?? []} onSelectJob={openJob}
        initialVehicle={urlParam("vehicle")} onSelectVehicle={imei => updateUrlParams({ vehicle: imei })} />
    </>
  );
}
