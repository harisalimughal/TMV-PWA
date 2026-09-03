import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchScenarios } from "../api";
import { formatLondonDateTime } from "../utils/date";
import { resolveDriver } from "../utils/drivers";
import { evidencePhotoCount } from "../utils/evidence";
import { SubmissionDetailDrawer } from "../components/SubmissionDetailDrawer";
import { SubmissionPageTemplate } from "../components/SubmissionPageTemplate";
import { ApiErrorState } from "../components/ApiErrorState";
import { ClipboardList, Search } from "lucide-react";

export function ParkingLiabilityPage() {
  const [activeTab, setActiveTab] = useState("Submissions");
  const [viewMode, setViewMode] = useState<"table" | "inbox">("table");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState("None");
  
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);

  const { data: response, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["scenarios", "parking", from, to],
    queryFn: () => fetchScenarios("ALL")
  });

  const processedData = useMemo(() => {
    if (!response?.items) return [];
    let filtered = response.items;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((item: any) => {
        const raw = item.rawRecord || item;
        const address = (item.address || raw["Address"] || "").toLowerCase();
        const client = (item.clientName || raw["Client Full Name"] || "").toLowerCase();
        const driver = resolveDriver(item.driver || raw["Driver"]).name.toLowerCase();
        return address.includes(q) || client.includes(q) || driver.includes(q);
      });
    }

    return filtered;
  }, [response?.items, search]);

  const paginatedData = processedData.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(processedData.length / pageSize);

  const isInvalidAddress = (addr?: string) => {
    if (!addr) return true;
    const lower = addr.toLowerCase().trim();
    if (lower.length < 8) return true; 
    if (["hhh", "test", "not recorded"].includes(lower)) return true;
    if (!/\s/.test(lower)) return true; 
    return false;
  };

  const toTitleCase = (str: string) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

  const tableHeader = (
    <>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Driver</th>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Date Submitted</th>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Address</th>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Full Client Name</th>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Parking Restriction Photos</th>
      <th className="py-4 px-4 text-eyebrow text-fg-subtle tracking-[0.03em]">Signature</th>
      <th className="py-4 px-4 w-16"></th>
    </>
  );

  const tableBody = (
    isError ? (
      <tr>
        <td colSpan={9} className="p-0 border-none">
          <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} className="border-none shadow-none" />
        </td>
      </tr>
    ) : isLoading ? (
      Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="h-[60px]">
          <td colSpan={9} className="px-4">
            <div className="h-4 bg-admin-line/40 rounded w-full animate-pulse"></div>
          </td>
        </tr>
      ))
    ) : paginatedData.length === 0 ? (
      <tr>
        <td colSpan={9} className="py-16 text-center">
          <div className="w-12 h-12 bg-admin-surface text-admin-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-card text-fg mb-1">No records match your filters</h3>
          <p className="text-[13px] text-admin-muted mb-4">Try adjusting your search or clearing filters.</p>
        </td>
      </tr>
    ) : (
      paginatedData.map((item: any, index: number) => {
        const raw = item.rawRecord || item;
        const rowNumber = (page - 1) * pageSize + index + 1;
        const driverStr = item.driver || raw["Driver"] || "N/A";
        const resolvedDriver = resolveDriver(driverStr);
        const dateStr = item.timestamp || raw["Timestamp"] || raw["Date"] || "";
        const formattedTime = formatLondonDateTime(dateStr);
        const rawAddress = item.address || raw["Address"] || "Not recorded";
        const invalidAddr = isInvalidAddress(rawAddress);
        const clientName = toTitleCase(item.clientName || raw["Client Full Name"] || raw["Client Name"] || "Not recorded");
        // Real photo count from the payload -- null when the record carries no photos
        // array, which is shown as "Not recorded" rather than an invented number.
        const photoCount = evidencePhotoCount(item);
        const hasSig = !!(item.signature?.url || item.signatureUrl || raw["Signature Url"]);

        return (
          <tr 
            key={item.id || index}
            onClick={() => setSelectedSubmission({ ...item, resolvedDriver, formattedTime, rawAddress, clientName })}
            className={`h-[60px] group cursor-pointer transition select-none ${resolvedDriver.needsReassignment ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'bg-white hover:bg-admin-surface'}`}
          >
            <td className="px-4 text-center">
              <input type="checkbox" onClick={e => e.stopPropagation()} className="rounded text-admin-brand" />
            </td>
            <td className="px-2 text-center font-mono text-[14px] font-bold text-admin-muted tabular-nums">{rowNumber}</td>
            <td className="px-4">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] ${resolvedDriver.color}`}>
                  {resolvedDriver.code}
                </div>
                <div>
                  <span className="font-semibold text-admin-brand text-[14px] block">{resolvedDriver.name}</span>
                  {resolvedDriver.needsReassignment && (
                    <span className="text-[11px] uppercase tracking-[0.02em] font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-control mt-2 block w-max">
                      Needs Reassignment
                    </span>
                  )}
                </div>
              </div>
            </td>
            <td className="px-4 text-[13px] font-normal text-admin-muted tabular-nums whitespace-nowrap">{formattedTime}</td>
            <td className="px-4">
              {invalidAddr ? (
                <div className="flex items-center gap-1.5 text-admin-muted/70 text-[13px]">
                  <span className="italic">Address not properly recorded</span>
                </div>
              ) : (
                <span className="text-[14px] font-medium text-admin-ink">{rawAddress}</span>
              )}
            </td>
            <td className="px-4">
              <span className={`text-[14px] font-medium ${clientName === 'Not Recorded' ? 'text-admin-muted italic' : 'text-admin-ink'}`}>
                {clientName}
              </span>
            </td>
            <td className="px-4">
              {photoCount === null ? (
                <span className="text-[13px] text-admin-muted italic">Not recorded</span>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {Array.from({ length: Math.min(3, photoCount) }).map((_, i) => (
                      <div key={i} className="w-7 h-7 rounded-control bg-admin-surface border border-admin-line flex items-center justify-center overflow-hidden">
                        <div className="w-full h-full bg-black/5" />
                      </div>
                    ))}
                  </div>
                  <span className="text-label font-medium text-fg-muted">
                    {photoCount} photo{photoCount === 1 ? "" : "s"}
                  </span>
                </div>
              )}
            </td>
            <td className="px-4">
              {hasSig ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-admin-status-green-bg text-admin-status-green text-[12px] font-semibold">
                  Signed
                </span>
              ) : (
                <span className="text-[13px] text-admin-muted italic">Missing</span>
              )}
            </td>
            <td className="px-4"></td>
          </tr>
        );
      })
    )
  );

  return (
    <>
      <SubmissionPageTemplate
        title="Parking Liability"
        icon={ClipboardList}
        status="Active"
        statusColor="green"
        activeTab={activeTab}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        from={from}
        to={to}
        onDateChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        itemCount={processedData.length}
        isFetching={isFetching || isLoading}
        onRefresh={() => refetch()}
        page={page}
        pageSize={pageSize}
        totalItems={processedData.length}
        onPageChange={setPage}
        tableHeader={tableHeader}
        tableBody={tableBody}
      />
      {selectedSubmission && (
        <SubmissionDetailDrawer
          isOpen={!!selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          job={selectedSubmission as any}
          kind="parking"
        />
      )}
    </>
  );
}
