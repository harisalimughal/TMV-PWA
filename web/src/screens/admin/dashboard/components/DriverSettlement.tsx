import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Columns2, Users, Loader2, RotateCcw } from "lucide-react";
import { fetchDrivers } from "../api";
import { driverReportHref, navigateAdmin } from "../utils/reportNavigation";
import "./driverReport.css";

export function DriverSettlement({ from, to }: { from?: string; to?: string }) {
  const query = useQuery({ queryKey: ["drivers_summary", from, to, "moving", "completed"], queryFn: ({ signal }) => fetchDrivers(from, to, true, signal, true), staleTime: 5_000, gcTime: 5 * 60_000 });
  const [selectedDriver, setSelectedDriver] = React.useState("");
  const drivers = (query.data?.drivers ?? []).filter(driver => driver.initials !== "UNASSIGNED" && driver.hasAccount);
  const options = [...drivers].sort((a, b) => a.fullName.localeCompare(b.fullName) || a.initials.localeCompare(b.initials));
  React.useEffect(() => {
    if (query.isSuccess && selectedDriver && !drivers.some(row => row.initials === selectedDriver)) setSelectedDriver("");
  }, [query.isSuccess, query.data, selectedDriver]);
  const rows = drivers.filter(row => row.completed > 0 && (!selectedDriver || row.initials === selectedDriver));
  return <section className="rpt-breakdown-summary space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-admin-ink">Driver Breakdown</h2><p className="text-sm text-admin-muted">{rows.length} {rows.length === 1 ? "driver" : "drivers"}</p></div>
      <select aria-label="Select driver" value={selectedDriver} onChange={event => setSelectedDriver(event.target.value)} disabled={query.isLoading || query.isError} className="border border-admin-line rounded-md px-3 py-2 bg-white text-sm w-full sm:w-64">
        <option value="">All drivers</option>
        {options.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName || driver.initials}{driver.fullName ? ` (${driver.initials})` : ""}</option>)}
      </select>
    </div>
    {query.isLoading ? <div role="status" className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : query.isError ?
      <div role="alert" className="py-6 text-red-700">{(query.error as Error).message}<button title="Retry driver summary" onClick={() => void query.refetch()} className="ml-3 p-2"><RotateCcw size={16} /></button></div> :
      <div className="overflow-x-auto"><table className="w-full text-sm text-left min-w-[720px]"><thead className="border-y border-admin-line bg-admin-surface text-admin-muted"><tr>
        {["Driver", "Jobs", "Total Charges (£)", "Driver Collected (£)", "Moving Hours", "Overtime Hours", "Report"].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}
      </tr></thead><tbody className="divide-y divide-admin-line">{rows.map(row => {
        const href = driverReportHref(row.initials, from, to);
        return <tr key={row.initials} className="bg-white hover:bg-admin-surface/50">
          <td className="p-3"><a href={href} onClick={event => { if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); navigateAdmin(href); } }} className="font-semibold text-admin-brand focus-visible:outline focus-visible:outline-2">{row.fullName}<span className="block text-xs text-admin-muted font-normal">{row.initials}</span></a></td>
          <td className="p-3 tabular-nums">{row.completed}</td><td className="p-3 tabular-nums">{(row.calculatedChargesPounds ?? row.totalChargesPounds).toFixed(2)}</td>
          <td className="p-3 tabular-nums">{row.revenuePounds.toFixed(2)}</td>
          <td className="p-3 tabular-nums">{row.movingKnownSeconds == null || row.movingKnownSeconds === 0 && row.completed > 0 && (row.movingUnknownJobs ?? 0) >= row.completed ? "Unavailable" : `${(row.movingKnownSeconds / 3600).toFixed(1)}h`}
            {!!row.movingUnknownJobs && <small className="block text-red-700 font-normal text-sm">{row.movingUnknownJobs} unavailable</small>}
            {!!row.movingPartialJobs && <small className="block text-admin-muted font-normal text-sm">{row.movingPartialJobs} partial jobs</small>}</td>
          <td className="p-3 tabular-nums">{(row.overtimeMinutes / 60).toFixed(1)}h</td><td className="p-3"><div className="flex gap-2"><a href={href} aria-label={`Open report for ${row.fullName}`} title={`Open report for ${row.fullName}`} onClick={event => { if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); navigateAdmin(href); } }} className="inline-flex p-2 border border-admin-line rounded-md text-admin-brand"><ArrowUpRight size={17} /></a><a href={driverReportHref(row.initials, from, to, "comparison")} title={`Compare system and manual details for ${row.fullName}`} aria-label={`Compare system and manual details for ${row.fullName}`} onClick={event => { if (!event.ctrlKey && !event.metaKey) { event.preventDefault(); navigateAdmin(driverReportHref(row.initials, from, to, "comparison")); } }} className="inline-flex p-2 border border-admin-line rounded-md text-admin-brand"><Columns2 size={17} /></a></div></td>
        </tr>;
      })}</tbody></table>{!rows.length && <div className="py-12 text-center text-admin-muted"><Users className="mx-auto mb-3" size={24} />No finished job data</div>}</div>}
  </section>;
}
