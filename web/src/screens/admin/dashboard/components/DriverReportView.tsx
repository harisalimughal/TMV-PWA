/**
 * Driver report shell: identity header (back to Drivers, name, code, email, account,
 * driver picker, export), the date range, and the six tabs of the deployed dashboard --
 * Jobs | Performance & Timings | Payments | Comparison | Tunnel Charges | Congestion
 * Charges. Every tab reads the same report for the same driver and range.
 */
import React from "react";
import { ArrowLeft, Mail } from "lucide-react";
import type { DriverReport } from "../driverReport.types";
import { REPORT_TABS, type ReportTab } from "../utils/reportNavigation";
import { formatRange } from "../utils/format";
import { DateRangePicker } from "./DateRangePicker";
import { Badge, EmptyState, ExportMenu, FilterSelect, Notice, Tabs, TabPanel, focusRing } from "./ds";
import { JobsTab } from "./report/JobsTab";
import { PerformanceTab } from "./report/PerformanceTab";
import { PaymentsTab } from "./report/PaymentsTab";
import { ComparisonTab, type ReconSource } from "./report/ComparisonTab";
import { RoadChargesTab } from "./report/RoadChargesTab";
import type { GpsState, ReconFilter, ReportLocationPatch } from "./report/types";
import { cx } from "../../../../ui/cx";

export { REPORT_TABS };
export type { ReportTab };
// Retain the existing local report preview entry points after moving this component.
export { JobComparison } from "./report/ComparisonTab";

export const TAB_LABELS: Record<ReportTab, string> = {
  jobs: "Jobs", performance: "Performance & Timings", payments: "Payments", comparison: "Comparison", tunnels: "Tunnel Charges", congestion: "Congestion Charges"
};

export interface ReportViewLocation { tab: ReportTab; reconFilter: ReconFilter; roadView: "events" | "jobs"; expand?: string; sortDir?: "asc" | "desc" }

interface Props {
  report: DriverReport;
  location: ReportViewLocation;
  from: string; to: string;
  gps: GpsState;
  recon: ReconSource;
  refreshing?: boolean;
  driverPicker?: React.ReactNode;
  onLocation: (patch: ReportLocationPatch) => void;
  onDates: (from?: string, to?: string) => void;
  onPage: (key: string, page: number) => void;
  onJob: (id: string) => void;
  onDrivers: () => void;
  onExport?: (format: "pdf" | "xlsx" | "breakdown") => void;
  exporting?: "pdf" | "xlsx" | "breakdown" | null;
  exportError?: string;
}

/** Identity block shared by the loaded report and its loading state. */
export function ReportHeader({ name, initials, email, registered, onDrivers, actions }: {
  name: string; initials: string; email?: string | null; registered?: boolean; onDrivers: () => void; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onDrivers} aria-label="Back to Drivers" className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-admin-line bg-surface text-admin-ink-2 hover:text-admin-ink", focusRing)}>
          <ArrowLeft aria-hidden className="h-4 w-4" />
        </button>
        <span aria-hidden className="tmv-avatar grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[15px] font-bold">{initials.slice(0, 2)}</span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-admin-ink-2">Driver Report</p>
          <h1 className="truncate text-[24px] font-bold leading-8 tracking-tight text-admin-ink">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-admin-ink-2">
            <span className="font-mono font-semibold text-admin-ink">{initials}</span>
            {email ? <span className="inline-flex min-w-0 items-center gap-1 break-all"><Mail aria-hidden className="h-3.5 w-3.5 shrink-0" />{email}</span> : null}
            {registered === undefined ? null : registered ? <Badge tone="success">Registered driver</Badge> : <Badge>Archived identity</Badge>}
          </p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </header>
  );
}

export function DriverReportView({ report, location, from, to, gps, recon, driverPicker, onLocation, onDates, onPage, onJob, onDrivers, onExport, exporting, exportError }: Props) {
  const tabProps = { report, gps, onJob, onPage, go: onLocation };
  const empty = report.summary.completedJobs === 0;
  const range = formatRange(from, to);
  const tab = location.tab;
  return (
    <>
      <ReportHeader name={report.driver.name} initials={report.driver.initials} email={report.driver.email} registered={report.driver.hasCurrentAccount} onDrivers={onDrivers}
        actions={<>
          {driverPicker}
          {onExport && <ExportMenu label={exporting ? "Preparing…" : "PDF / Excel"} options={[
            { id: "breakdown", label: "PDF — Driver Breakdown", scope: `Every job for ${report.driver.name}, ${range}: performance and timings, payments, jobs, comparison, tunnel and congestion. Opens your print dialog; choose Save as PDF.`, onSelect: () => onExport("breakdown"), disabled: Boolean(exporting) },
            { id: "pdf", label: "PDF — server export (original layout)", scope: `All jobs for ${report.driver.name}, ${range}, London time. Generated by the server with its own coverage notes.`, onSelect: () => onExport("pdf"), disabled: Boolean(exporting) },
            { id: "xlsx", label: "Excel — complete report", scope: `The same complete report as a spreadsheet, ${range}.`, onSelect: () => onExport("xlsx"), disabled: Boolean(exporting) }
          ]} />}
        </>} />
      {exportError && <Notice tone="danger" title="The report wasn't downloaded">{exportError} Choose PDF / Excel to try again.</Notice>}
      {exporting && <Notice tone="info">{exporting === "breakdown" ? "Building the Driver Breakdown from every job in the range…" : `Preparing the complete ${exporting === "pdf" ? "PDF" : "Excel"} report…`}</Notice>}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-admin-line bg-surface p-2.5">
        <DateRangePicker presets="records" from={from} to={to} onChange={onDates} />
        <FilterSelect label="Date order" value={location.sortDir ?? "asc"} onChange={value => onLocation({ sortDir: value as "asc" | "desc", expand: "" })}
          options={[{ value: "asc", label: "Ascending · oldest first" }, { value: "desc", label: "Descending · newest first" }]} className="w-[240px]" />
      </div>

      <Tabs label="Report sections" idBase="report" value={tab} onChange={next => onLocation({ tab: next, expand: "" })}
        tabs={REPORT_TABS.map(id => ({ id, label: TAB_LABELS[id] }))} />
      <TabPanel idBase="report" id={tab} className="space-y-4">
        {empty ? (
          <div className="tmv-panel">
            <EmptyState title={`No completed jobs for ${report.driver.name} in ${range}`} message="Reports are built from completed jobs. Choose a wider date range above." />
          </div>
        ) : (
          <>
            {tab === "jobs" && <JobsTab {...tabProps} expanded={location.expand} />}
            {tab === "performance" && <PerformanceTab {...tabProps} expanded={location.expand} />}
            {tab === "payments" && <PaymentsTab {...tabProps} />}
            {tab === "comparison" && <ComparisonTab {...tabProps} filter={location.reconFilter} expanded={location.expand} recon={recon} />}
            {tab === "tunnels" && <RoadChargesTab {...tabProps} roadType="tunnel" view={location.roadView} />}
            {tab === "congestion" && <RoadChargesTab {...tabProps} roadType="congestion" view={location.roadView} />}
          </>
        )}
      </TabPanel>
    </>
  );
}
