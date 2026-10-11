import { AdminFilterBar } from "../components/AdminFilterBar";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  FileText,
  Search,
  MoreHorizontal,
  Camera,
  ChevronRight,
  Download
} from "lucide-react";
import { FolderActionDropdown } from "../components/FolderActionDropdown";
import { SubmissionDetailDrawer } from "../components/SubmissionDetailDrawer";
import { PaperDossierReport } from "../components/PaperDossierReport";
import { NormalizedJob } from "../types";
import { fetchScenarios } from "../api";
import { PaperScenarioReport } from "../components/PaperScenarioReport";
import { formatLondonDateTime } from "../utils/date";
import { DateRangePicker } from "../components/DateRangePicker";
import { LiabilityConfigModal } from "../components/LiabilityConfigModal";
import { ApiErrorState } from "../components/ApiErrorState";
import { Settings2 } from "lucide-react";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { scenarioPointFromRecord } from "../utils/scenarioPoint";
import { useScenarioFilters, type ScenarioFilterControl } from "../hooks/useScenarioFilters";

interface Props {
  kind: "checkin" | "checkout" | "parking" | "liability";
  filterControl?: ScenarioFilterControl;
  viewSwitcher?: React.ReactNode;
}

const mapDriver = (raw: string) => {
  if (!raw || raw === "N/A" || raw === "undefined") return { name: "Unassigned", initials: "UN" };
  const d = raw.toLowerCase();
  if (d.includes("roman") || d === "mr") return { name: "Muhammad Roman", initials: "MR" };
  if (d.includes("caio") || d === "ka") return { name: "Caio Gabriel", initials: "KA" };
  if (d.includes("henrique") || d === "he") return { name: "Henrique Driver", initials: "HE" };
  if (d.includes("maico") || d === "mk") return { name: "Maico Lima", initials: "MK" };
  if (d.includes("rafael") || d.includes("cruz") || d === "rf") return { name: "Rafael Cruz", initials: "RF" };
  if (d.includes("tiago") || d === "ti") return { name: "Tiago Menagassi", initials: "TI" };
  if (d.includes("wander") || d.includes("mendes") || d === "wd") return { name: "Wander Mendes", initials: "WD" };
  if (d.includes("harris") || d === "ha") return { name: "Harris", initials: "HA" };
  return { name: raw, initials: raw.substring(0, 2).toUpperCase() };
};

const getAvatarColor = (initials: string) => {
  if (initials === "UN") return "bg-admin-surface border border-admin-line text-admin-muted";
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-indigo-100 text-indigo-700",
    "bg-cyan-100 text-cyan-700",
    "bg-teal-100 text-teal-700",
  ];
  const charCode = initials.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

const titleCase = (str: string) => {
  if (!str) return "—";
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const isTestGibberish = (text: string) => {
  if (!text || text === "—") return false;
  const lower = text.toLowerCase();
  if (lower.length < 5) return true;
  if (/^[a-z,.]+$/.test(lower) && !lower.includes(" ")) return true;
  if (lower.includes("test")) return true;
  return false;
};

export function ScenariosPage({ kind, filterControl, viewSwitcher }: Props) {
  const [page, setPage] = useState(1);
  const { from, to, searchQuery, driverFilter, setFrom, setTo, setSearchQuery, setDriverFilter } = useScenarioFilters(filterControl);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<any | null>(null);
  /** Set right before opening the drawer from the row-level "Download" action -- see
   *  the matching state in FinishedJobsPage.tsx and SubmissionDetailDrawer's
   *  autoDownload prop. */
  const [autoDownloadId, setAutoDownloadId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scenarios", kind, page, from, to, driverFilter],
    queryFn: () => fetchScenarios(kind, page, driverFilter || undefined, from, to),
    retry: 1
  });

  // Same roster + filter pattern as FinishedJobsPage's driver filter -- every driver
  // with a real account, resolved server-side against driver_accounts (see
  // scenarios.routes.ts's resolveDriverInitials), not the free-text `driver` field a
  // submission was stamped with.
  const { options: driverOptions, isLoading: driverOptionsLoading } = useDriverOptions();

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [kind]);

  const config = {
    checkin: { title: "Check In", refLabel: "Container No." },
    checkout: { title: "Check Out", refLabel: "Container No." },
    parking: { title: "Parking Liability", refLabel: "Address" },
    liability: { title: "Liability Report", refLabel: "Damage Report #" }
  }[kind];

  const filteredItems = (data?.items || []).filter((item: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const raw = item.rawRecord || item;
    const clientName = (item.clientName || raw["Client Name"] || raw["Client Full Name"] || "").toLowerCase();
    const driver = (item.driver || raw["Driver"] || "").toLowerCase();
    const jobId = (item.jobId || raw["Job ID"] || "").toLowerCase();
    const ref = (item.containerNumber || raw["Container Number"] || item.damageCategories || item.address || raw["Address"] || "").toLowerCase();
    return clientName.includes(q) || driver.includes(q) || ref.includes(q) || jobId.includes(q);
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      <AdminFilterBar dates={<DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />} count={isLoading ? "..." : `${filteredItems.length} submission${filteredItems.length === 1 ? "" : "s"}`}>

          {/* Driver filter -- same roster + behaviour as Finished Jobs' driver filter. */}
          <select
            aria-label="Filter by driver"
            value={driverFilter}
            onChange={e => { setDriverFilter(e.target.value); setPage(1); }}
            disabled={driverOptionsLoading}
            className="shrink-0 h-10 px-3 rounded-card border border-admin-line/50 bg-admin-surface text-[13px] font-medium text-admin-ink outline-none focus:border-admin-brand"
          >
            <option value="">{driverOptionsLoading ? "Loading drivers..." : "All drivers"}</option>
            {!driverOptionsLoading && driverOptions.map(d => (
              <option key={d.initials} value={d.initials}>{d.fullName || d.initials}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative w-full sm:w-64 order-last sm:order-none">
            <Search className="w-4 h-4 text-admin-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              aria-label="Search submissions"
              type="text"
              placeholder="Search reference, job, or user..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-card bg-admin-surface border border-admin-line/50 text-[13px] text-admin-ink focus:border-admin-brand focus:ring-1 focus:ring-admin-brand outline-none transition"
            />
          </div>

          {viewSwitcher}
          <div className="hidden sm:block w-px h-6 bg-admin-line mx-1 shrink-0" />
          <button onClick={() => refetch()} className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition" title="Refresh" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { window.location.href = `/api/admin/scenarios/${kind}/export.csv`; }} className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition" title="Export CSV" aria-label="Export CSV"><Download className="w-4 h-4" /></button>
          {kind === "liability" && <button onClick={() => setIsConfigOpen(true)} className="shrink-0 w-10 h-10 rounded-card flex items-center justify-center bg-admin-surface border border-admin-line/50 hover:bg-admin-line/40 text-admin-muted hover:text-admin-ink transition" title="Manage categories" aria-label="Manage categories"><Settings2 className="w-4 h-4" /></button>}
      </AdminFilterBar>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading {config.title.toLowerCase()} records...</span>
        </div>
      )}

      {isError && <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}

      {/* TABLE VIEW */}
      {!isLoading && !isError && (
        <div className="bg-white rounded-module shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line flex flex-col overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[14px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-admin-line bg-white">
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] pl-6">Timestamp</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Job ID</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Driver</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]" title={config.refLabel}>{config.refLabel}</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Client Name</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Pictures</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em]">Sign here.</th>
                  <th className="py-5 px-4 font-semibold text-eyebrow text-fg-subtle tracking-[0.03em] text-center">Docs</th>
                  <th className="py-5 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {filteredItems.map((item: any) => {
                  const isExpanded = expandedId === item.id;
                  const raw = item.rawRecord || item;
                  
                  // Driver mapping -- prefer the backend's own resolution against the
                  // real driver_accounts roster (item.driverName/driverInitials, added
                  // once the driver filter needed real initials to match against);
                  // mapDriver's hardcoded first-name guessing is only a fallback for
                  // rows with no matching account, which used to show the raw stored
                  // value (almost always the driver's email) for every row.
                  const rawDriverStr = item.driver || raw["Driver"] || "N/A";
                  const { name: driverName, initials: driverInitials } = item.driverName
                    ? { name: item.driverName, initials: item.driverInitials || item.driverName.substring(0, 2).toUpperCase() }
                    : mapDriver(rawDriverStr);
                  
                  // Job ID mapping
                  const jobId = item.jobId || raw["Job ID"] || "—";

                  // Timestamp formatting
                  const timestampStr = item.timestamp || raw["Timestamp"] || raw["Date"] || "";
                  const formattedTime = formatLondonDateTime(timestampStr);
                  
                  // Client Name capitalization
                  const rawClient = item.clientName || raw["Client Name"] || raw["Client Full Name"] || "—";
                  const formattedClientName = rawClient !== "—" ? titleCase(rawClient) : "—";
                  
                  // Reference (Address, Damage, Container)
                  let refText = "—";
                  if (kind === "checkin" || kind === "checkout") refText = item.containerNumber || raw["Container Number"] || "—";
                  if (kind === "parking") refText = item.address || raw["Address"] || "—";
                  if (kind === "liability") refText = item.damageCategories || "—";
                  
                  const scenarioPoint = scenarioPointFromRecord(item);
                  const isTestRef = isTestGibberish(refText);

                  // Extract Media
                  const photos = item.photos?.filter((p: any) => p.thumbUrl || p.fileUrl || p.driveUrl) || [];
                  const sigUrl = item.signature?.url || item.signatureUrl || raw["Signature Url"];

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setPreviewJob(item)}
                        className={`h-[60px] group cursor-pointer transition select-none ${isExpanded ? "bg-admin-surface/50" : "hover:bg-[#F9FAFB]"}`}
                      >
                        <td className="px-6 text-[13px] text-admin-muted tabular-nums">
                          {formattedTime}
                        </td>

                        <td className="px-4">
                          {jobId !== "—" ? (
                            <div className="flex flex-col items-start gap-1">
                              <button className="font-medium text-[#2563EB] hover:underline text-[14px]" onClick={(e) => { e.stopPropagation(); }}>
                                {jobId}
                              </button>
                              {scenarioPoint && (
                                <span
                                  title={scenarioPoint.full}
                                  className="rounded-control border border-admin-brand/20 bg-admin-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.03em] text-admin-brand"
                                >
                                  {scenarioPoint.point}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-admin-muted italic text-[13px]">Not recorded</span>
                              {scenarioPoint && (
                                <span
                                  title={scenarioPoint.full}
                                  className="rounded-control border border-admin-brand/20 bg-admin-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.03em] text-admin-brand"
                                >
                                  {scenarioPoint.point}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        
                        <td className="px-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${getAvatarColor(driverInitials)}`}>
                              {driverInitials}
                            </div>
                            <span className="font-medium text-admin-ink text-[13px]">{driverName}</span>
                          </div>
                        </td>

                        <td className="px-4 text-[14px]">
                          {refText === "—" ? (
                            <span className="text-admin-muted italic text-[13px]">Not recorded</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {kind === "liability" ? (
                                <div className="flex flex-wrap items-center gap-1.5 max-w-[280px]">
                                  {refText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).map((cat, i) => (
                                    <span key={i} className="px-2 py-1 rounded-control bg-admin-surface border border-admin-line text-admin-ink text-[11px] font-medium whitespace-nowrap truncate max-w-[120px]" title={cat}>
                                      {cat}
                                    </span>
                                  ))}
                                  {refText.split(",").filter(Boolean).length > 3 && (
                                    <span className="px-2 py-1 rounded-control bg-white border border-admin-line text-admin-muted text-[11px] font-medium whitespace-nowrap shadow-sm cursor-help" title={refText}>
                                      +{refText.split(",").filter(Boolean).length - 3} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <span className={`truncate max-w-[150px] ${isTestRef ? 'text-admin-muted' : 'text-admin-ink font-mono tabular-nums'}`} title={refText}>
                                    {refText}
                                  </span>
                                  {isTestRef && (
                                    <span className="px-1.5 py-0.5 rounded-control bg-admin-surface border border-admin-line text-admin-muted text-[10px] font-semibold uppercase tracking-wider" title="Test Record">
                                      Unverified / Test Data
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 text-[13px] text-admin-ink font-medium">
                          {formattedClientName}
                        </td>

                        <td className="px-4">
                          <div className="flex items-center">
                            {photos.length > 0 ? (
                              <div className="flex items-center">
                                {photos.slice(0, 3).map((p: any, i: number) => (
                                  <div key={i} className={`w-8 h-8 rounded-control overflow-hidden border border-admin-line bg-admin-surface ${i > 0 ? "-ml-3 shadow-sm" : ""}`}>
                                    <img src={p.thumbUrl || p.fileUrl || p.driveUrl} alt="Evidence" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                                {photos.length > 3 && (
                                  <div className="w-8 h-8 rounded-control border border-admin-line bg-white flex items-center justify-center text-[11px] font-medium text-admin-muted -ml-3 z-10 shadow-sm">
                                    +{photos.length - 3}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Camera className="w-4 h-4 text-admin-muted mx-4 opacity-40" />
                            )}
                          </div>
                        </td>

                        <td className="px-4">
                          {sigUrl ? (
                            <img
                              src={sigUrl}
                              alt="Signature"
                              className="w-14 h-7 object-contain mx-4 border border-admin-line bg-white rounded-control p-0.5 shadow-sm"
                            />
                          ) : (
                            <div className="w-14 h-7 rounded-control border border-dashed border-admin-line-strong mx-4 opacity-50" />
                          )}
                        </td>

                        <td className="px-4 pr-6 text-center">
    <FolderActionDropdown
      hasFolderUrl={!!(item.folderUrl || item.driveFolderUrl)}
      onOpenFolder={() => window.open((item.folderUrl || item.driveFolderUrl), "_blank")}
      onPreview={() => { setAutoDownloadId(null); setPreviewJob(item); }}
      onDownload={() => {
        // Same reasoning as FinishedJobsPage: hand off to the drawer's own download
        // flow (autoDownload) instead of printing straight from a permanently hidden
        // copy with no visible render step, which Jobs' working flow never does.
        setAutoDownloadId(item.id);
        setPreviewJob(item);
      }}
    />
  </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0 border-b border-admin-line bg-[#FAFAFA]">
                            <div className="p-6 overflow-hidden">
                              <PaperScenarioReport item={item} kind={kind} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Footer Row */}
          {data?.pagination && (
            <div className="px-4 sm:px-6 py-4 border-t border-admin-line bg-white flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-admin-muted">
                Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, data.pagination.total)} of {data.pagination.total} {data.pagination.total === 1 ? "record" : "records"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  disabled={page === 1} 
                  onClick={() => setPage(p => p - 1)} 
                  className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Prev
                </button>
                <div className="text-label font-medium text-fg-muted mx-2">{page} / {data.pagination.totalPages || 1}</div>
                <button 
                  disabled={page >= (data.pagination.totalPages || 1)} 
                  onClick={() => setPage(p => p + 1)} 
                  className="px-3 py-1.5 rounded-control border border-admin-line bg-white text-[13px] font-medium text-admin-ink hover:bg-admin-surface disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {kind === "liability" && <LiabilityConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />}
      {previewJob && (
        <SubmissionDetailDrawer
          job={previewJob}
          kind={kind}
          isOpen={!!previewJob}
          autoDownload={autoDownloadId === previewJob.id}
          onClose={() => { setPreviewJob(null); setAutoDownloadId(null); }}
          onNavigate={(dir) => {
            if (!data?.items) return;
            const idx = data.items.findIndex((j: any) => (j.id || j.jobId) === (previewJob.id || previewJob.jobId));
            if (dir === 'next' && idx < data.items.length - 1) setPreviewJob(data.items[idx + 1]);
            if (dir === 'prev' && idx > 0) setPreviewJob(data.items[idx - 1]);
          }}
          hasNext={data?.items ? data.items.findIndex((j: any) => (j.id || j.jobId) === (previewJob.id || previewJob.jobId)) < data.items.length - 1 : false}
          hasPrev={data?.items ? data.items.findIndex((j: any) => (j.id || j.jobId) === (previewJob.id || previewJob.jobId)) > 0 : false}
        />
      )}
    </div>
  );
}

