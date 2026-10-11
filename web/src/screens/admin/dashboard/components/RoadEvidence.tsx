import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRoadAssessment } from "../api";

export function RoadEvidence({ jobId, visitId, issues, load = fetchRoadAssessment }: { jobId: string | null; visitId: string; issues: string[]; load?: typeof fetchRoadAssessment }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["road_assessment", jobId], queryFn: () => load(jobId!), enabled: open && !!jobId, staleTime: 0 });
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Evidence notes</summary>
    {issues.map((issue, index) => <p key={index}>{issue}</p>)}
    {query.isLoading && open && jobId ? <p role="status">Loading charge evidence</p> : null}
    {query.isError ? <p role="alert">{(query.error as Error).message}</p> : null}
    {query.data?.activity.filter(row => row.visitId === visitId).map(row => <p key={row.visitId}>{row.chargeable === true ? "Chargeable window" : row.chargeable === false ? "Outside chargeable window" : "Chargeability unknown"} · {row.reason}</p>)}
    {query.data?.flags.map((flag, index) => <p key={`flag-${index}`}><strong>{flag.code}</strong> · {flag.reason}</p>)}
  </details>;
}
