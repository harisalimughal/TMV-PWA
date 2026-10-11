import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJobLiabilityReport } from "../api";
export function JobLiabilityEvidence({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["job_liability_report", jobId], queryFn: () => fetchJobLiabilityReport(jobId), enabled: open, retry: 1 });
  return <details className="rpt-chart-data" onToggle={event => setOpen(event.currentTarget.open)}><summary>Linked penalties &amp; liability evidence</summary>
    {query.isLoading && open ? <p role="status">Loading incident evidence</p> : null}
    {query.isError ? <p role="alert">{(query.error as Error).message}</p> : null}
    {query.data?.coverage === "partial" ? <p>Partial incident evidence</p> : null}
    {query.data?.items.map(record => <p key={record.id}><strong>{record.type}</strong> · {record.description} · {record.amountPence === null ? "Amount unknown" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(record.amountPence / 100)} · {record.status}</p>)}
    {query.data && !query.data.items.length ? <p>No linked incidents.</p> : null}
  </details>;
}
