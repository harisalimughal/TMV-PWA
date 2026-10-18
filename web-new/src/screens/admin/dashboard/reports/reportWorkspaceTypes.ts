import type { DriverJobReport, DriverLoadKind } from "./driverJobReport";

export type ReportType = "driver-jobs" | "driver-breakdown" | "jobs-csv";

/** Everything that decides what a report contains, frozen when Generate is pressed. */
export interface ReportRequest {
  readonly type: ReportType;
  readonly allDrivers: boolean;
  /** The driver codes the report covers (empty only for the server's jobs list with all drivers). */
  readonly drivers: readonly string[];
  /** Drivers left out on purpose (inactive drivers the user turned off); named in the report. */
  readonly excluded: readonly string[];
  readonly range: Readonly<{ from: string; to: string }>;
}

/** One state at a time: a loading request cannot also have a result or an error. */
export type Phase =
  | { kind: "idle" }
  | { kind: "loading"; request: ReportRequest; done: number; total: number; states: Readonly<Record<string, DriverLoadKind>>; /** A retry in progress keeps the partial report it started from, so Cancel returns to it. */ resume?: DriverJobReport }
  | { kind: "ready"; request: ReportRequest; report: DriverJobReport }
  | { kind: "partial"; request: ReportRequest; report: DriverJobReport }
  | { kind: "error"; request: ReportRequest; message: string }
  | { kind: "done"; request: ReportRequest; message: string };

/** Why the preview is empty: never generated, the options changed after a result, or the run was cancelled. */
export type PreviewNotice = "changed" | "cancelled" | null;
