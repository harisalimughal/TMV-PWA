import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  Table as TableIcon,
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
import { Button } from "../../../../ui";
import { PaperDossierReport } from "../components/PaperDossierReport";
import { NormalizedJob } from "../types";
import { fetchScenarios } from "../api";
import { PaperScenarioReport } from "../components/PaperScenarioReport";
import { formatLondonDateTime } from "../utils/date";
import { DateRangePicker } from "../components/DateRangePicker";
import { LiabilityConfigModal } from "../components/LiabilityConfigModal";
import { LiabilityMobileForm } from "../components/LiabilityMobileForm";
import { Settings2, Smartphone } from "lucide-react";

interface Props {
  kind: "checkin" | "checkout" | "parking" | "liability";
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

export function ScenariosPage({ kind }: Props) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<any | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scenarios", kind, page, from, to],
    queryFn: () => fetchScenarios(kind, page),
    retry: 1
  });

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
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-2">
        <h1 className="text-title text-fg truncate">{config.title}</h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {kind === "liability" && (
            <>
              <Button
                variant="secondary"
                onClick={() => setIsConfigOpen(true)}
                iconLeft={<Settings2 />}
                aria-label="Manage categories"
                className="shrink-0"
              >
                <span className="hidden sm:inline">Manage categories</span>
              </Button>
              <Button
                onClick={() => setIsMobileOpen(true)}
                iconLeft={<Smartphone />}
                aria-label="Preview mobile form"
                className="shrink-0"
              >
                <span className="hidden sm:inline">Preview mobile form</span>
              </Button>
              <div className="hidden sm:block w-[1px] h-6 bg-admin-line mx-1" />
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = `/api/admin/scenarios/${kind}/export.csv`;
            }}
            iconLeft={<Download />}
            aria-label="Export CSV"
            className="shrink-0"
          >
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card">
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-[13px] font-medium transition ${
              viewMode === "table" ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink"
            }`}
          >
            <TableIcon className="w-4 h-4" /> Table
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-[13px] font-medium transition ${
              viewMode === "cards" ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink"
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Cards
          </button>
        </div>
        
        <div className="w-[1px] h-6 bg-admin-line mx-2" />
        
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
          <input 
            type="text" 
            placeholder="Search reference, job, or user..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-full border border-admin-line bg-admin-surface text-[13px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand focus:bg-white transition"
          />
        </div>

        <div className="w-[1px] h-6 bg-admin-line mx-2" />

        {/* Date Ranges. These four chips previously had no handler at all -- they
            highlighted on hover and did nothing. They now drive the same from/to the
            DateRangePicker beside them uses, and show which one is active. */}
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card">
          {RANGE_PRESETS.map(preset => {
            const range = preset.range();
            const isActive = from === range.from && to === range.to;
            return (
              <button
                key={preset.label}
                onClick={() => {
                  setFrom(range.from);
                  setTo(range.to);
                  setPage(1);
                }}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-control text-[12px] font-medium transition ${
                  isActive ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink hover:bg-white/50"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />

        <div className="w-[1px] h-6 bg-admin-line mx-2" />
        
        <span className="text-[13px] text-admin-muted font-medium pr-2">
          {isLoading ? "..." : `${filteredItems.length} submission${filteredItems.length === 1 ? "" : "s"}`}
        </span>

        <button 
          onClick={() => refetch()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading {config.title.toLowerCase()} records...</span>
        </div>
      )}

      {isError && (
        <div className="p-8 text-center text-admin-status-red bg-admin-status-red-bg rounded-module border border-admin-status-red/20 shadow-sm">
          Failed to load {config.title.toLowerCase()} records.
        </div>
      )}

      {/* TABLE VIEW */}
      {!isLoading && !isError && viewMode === "table" && (
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
                  
                  // Driver mapping
                  const rawDriverStr = item.driver || raw["Driver"] || "N/A";
                  const { name: driverName, initials: driverInitials } = mapDriver(rawDriverStr);
                  
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
                            <button className="font-medium text-[#2563EB] hover:underline text-[14px]" onClick={(e) => { e.stopPropagation(); }}>
                              {jobId}
                            </button>
                          ) : (
                            <span className="text-admin-muted italic text-[13px]">Not recorded</span>
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
      onPreview={() => setPreviewJob(item)}
      onDownload={() => {
        setPreviewJob(item);
        setTimeout(() => {
          window.print();
        }, 500);
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

      {!isLoading && !isError && viewMode === "cards" && (
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
           <div className="bg-white p-6 rounded-module shadow-sm border border-admin-line">
             <p className="text-admin-muted text-[13px]">Card view available on mobile devices.</p>
           </div>
         </div>
      )}

          {kind === "liability" && <LiabilityConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />}
      {kind === "liability" && <LiabilityMobileForm isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />}
      {previewJob && (
        <SubmissionDetailDrawer
          job={previewJob}
          kind={kind}
          isOpen={!!previewJob}
          onClose={() => setPreviewJob(null)}
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

/** Relative date presets for the Scenarios toolbar chips. Days are resolved in
 *  Europe/London so a late-evening click doesn't roll the range into tomorrow. */
const RANGE_PRESETS: Array<{ label: string; range: () => { from?: string; to?: string } }> = [
  { label: "All Time", range: () => ({ from: undefined, to: undefined }) },
  { label: "Today", range: () => ({ from: londonDay(0), to: londonDay(0) }) },
  { label: "7 Days", range: () => ({ from: londonDay(-6), to: londonDay(0) }) },
  { label: "30 Days", range: () => ({ from: londonDay(-29), to: londonDay(0) }) }
];

function londonDay(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}
