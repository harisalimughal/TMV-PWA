import type { DriverReport } from "../../driverReport.types";
import type { ReportTab } from "../../utils/reportNavigation";

export type ReconFilter = "review" | "missing" | "differences" | "all";
export type RoadType = "tunnel" | "congestion";

/** Everything a report tab can change about where the user is. Mirrored in the URL. */
export interface ReportLocationPatch {
  tab?: ReportTab;
  reconFilter?: ReconFilter;
  roadView?: "events" | "jobs";
  /** Expanded job (Jobs and Comparison tabs) or the job picked in a job filter. */
  expand?: string;
  sortDir?: "asc" | "desc";
}

export interface GpsState { loading: boolean; error?: string; retry?: () => void; available: boolean }

export interface ReportTabProps {
  report: DriverReport;
  gps: GpsState;
  onJob: (jobId: string) => void;
  onPage: (key: string, page: number) => void;
  go: (patch: ReportLocationPatch) => void;
}
