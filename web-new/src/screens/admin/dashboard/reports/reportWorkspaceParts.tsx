/**
 * Presentational pieces of the Generate Report workspace. They hold no report logic: the dialog passes values
 * and handlers in. Everything uses the admin tokens, so Aurora Light and Midnight both follow, and every state
 * carries a text label (colour is never the only signal).
 */
import React, { useId, useState } from "react";
import { Ban, Check, CheckCircle2, CircleDashed, FileSpreadsheet, FileText, FileType, Loader2, MinusCircle, Search, Table2, UserRound, XCircle } from "lucide-react";
import { cx } from "../../../../ui/cx";
import { Badge, controlBase } from "../components/ds";
import { NOT_AVAILABLE, cellText, JOB_COLUMNS, type DriverLoadKind, type JobLine } from "./driverJobReport";
import type { ReportFormat } from "./exporters";
import type { ReportType } from "./reportWorkspaceTypes";

export const EYEBROW = "text-[11.5px] font-semibold uppercase tracking-[0.08em] text-admin-ink-2";

export function Step({ n, title, hint, children }: { n: number; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-admin-ink">
        <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-admin-brand-soft text-[11px] font-bold text-admin-brand">{n}</span>
        {title}
      </h3>
      {children}
      {hint && <div className="mt-1.5 text-[12.5px] leading-[18px] text-admin-ink-2">{hint}</div>}
    </div>
  );
}

/* --------------------------------------------------------- selection controls ---- */

const PILL = "inline-flex h-9 min-w-0 cursor-pointer items-center rounded-xl border px-3 text-[13px] font-semibold transition motion-reduce:transition-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-admin-brand";

/** Radio group drawn as pills. Real radio inputs, so arrow keys and screen readers work as for any radio group. */
export function PillGroup<T extends string>({ name, legend, value, options, onChange }: { name: string; legend: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <label key={option.value} className={cx(PILL, value === option.value ? "border-admin-brand/45 bg-admin-brand-soft text-admin-brand" : "border-admin-line bg-surface text-admin-ink-2 hover:border-admin-brand/30 hover:text-admin-ink")}>
            <input type="radio" className="sr-only" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TYPE_ICON: Record<ReportType, React.ComponentType<{ className?: string }>> = { "driver-jobs": FileText, "driver-breakdown": UserRound, "jobs-csv": Table2 };

export function TypeCards({ value, options, onChange }: { value: ReportType; options: Array<{ value: ReportType; label: string; hint: string }>; onChange: (value: ReportType) => void }) {
  const base = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Report type</legend>
      <div className="grid gap-2">
        {options.map(option => {
          const Icon = TYPE_ICON[option.value], selected = value === option.value, title = `${base}-${option.value}-t`, desc = `${base}-${option.value}-d`;
          return (
            <label key={option.value} className={cx("relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition motion-reduce:transition-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-admin-brand",
              selected ? "border-admin-brand/55 bg-admin-brand-soft shadow-[var(--admin-shadow-sm)]" : "border-admin-line bg-surface hover:border-admin-brand/30")}>
              <input type="radio" className="sr-only" name="report-type" value={option.value} checked={selected} aria-labelledby={title} aria-describedby={desc} onChange={() => onChange(option.value)} />
              <span aria-hidden className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl border", selected ? "border-admin-brand/30 bg-surface text-admin-brand" : "border-admin-line bg-admin-surface text-admin-ink-2")}><Icon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span id={title} className="block text-[14px] font-semibold text-admin-ink">{option.label}</span>
                <span id={desc} className="mt-0.5 block text-[12.5px] leading-[18px] text-admin-ink-2">{option.hint}</span>
              </span>
              {selected && <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-admin-brand" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const FORMAT_META: Record<ReportFormat, { label: string; note: string; icon: React.ComponentType<{ className?: string }> }> = {
  pdf: { label: "PDF", note: "Formatted document for viewing and sharing.", icon: FileText },
  xlsx: { label: "Excel (.xlsx)", note: "Structured spreadsheet for analysis.", icon: FileSpreadsheet },
  docx: { label: "Word (.docx)", note: "Editable report document.", icon: FileType },
  csv: { label: "CSV (.csv)", note: "Plain data: report details, totals and job rows.", icon: Table2 }
};
export const FORMAT_LABEL: Record<ReportFormat, string> = { pdf: "PDF", xlsx: "Excel (.xlsx)", csv: "CSV (.csv)", docx: "Word (.docx)" };
/** CSV from the server's jobs list has no totals; say so rather than reuse the report CSV wording. */
export function formatNote(format: ReportFormat, type: ReportType): string {
  if (type === "jobs-csv") return "The server's jobs export: one row per job.";
  if (type === "driver-breakdown") return format === "pdf" ? "The server's full driver report as a document." : "The server's full driver report as a spreadsheet.";
  return FORMAT_META[format].note;
}

export function FormatTiles({ value, formats, type, onChange }: { value: ReportFormat; formats: ReportFormat[]; type: ReportType; onChange: (value: ReportFormat) => void }) {
  const base = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">File format</legend>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {formats.map(format => {
          const Icon = FORMAT_META[format].icon, selected = value === format, title = `${base}-${format}-t`, desc = `${base}-${format}-d`;
          return (
            <label key={format} className={cx("relative flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition motion-reduce:transition-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-admin-brand",
              selected ? "border-admin-brand/55 bg-admin-brand-soft" : "border-admin-line bg-surface hover:border-admin-brand/30")}>
              <input type="radio" className="sr-only" name="report-format" value={format} checked={selected} aria-labelledby={title} aria-describedby={desc} onChange={() => onChange(format)} />
              <span aria-hidden className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", selected ? "border-admin-brand/30 bg-surface text-admin-brand" : "border-admin-line bg-admin-surface text-admin-ink-2")}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span id={title} className="block truncate text-[13.5px] font-semibold text-admin-ink">{FORMAT_META[format].label}</span>
                <span id={desc} className="block text-[12px] leading-[17px] text-admin-ink-2">{formatNote(format, type)}</span>
              </span>
              {selected && <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-admin-brand" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface DriverRow { initials: string; fullName: string; active: boolean }

/** Searchable multi-select for a long roster. The search only narrows what is shown; the selection is kept. */
export function DriverChecklist({ options, selected, onToggle, onSelectShown, onClear }: {
  options: DriverRow[]; selected: string[]; onToggle: (code: string, checked: boolean) => void; onSelectShown: (codes: string[]) => void; onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter(option => `${option.fullName} ${option.initials}`.toLowerCase().includes(needle)) : options;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-ink-2" />
        <input type="search" aria-label="Search drivers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search drivers" className={cx(controlBase, "w-full pl-9")} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-admin-ink-2">
        <span aria-live="polite">{selected.length} of {options.length} selected</span>
        <span className="flex gap-3">
          <button type="button" className="font-semibold text-admin-brand underline-offset-2 hover:underline disabled:opacity-50" disabled={!shown.length} onClick={() => onSelectShown(shown.map(option => option.initials))}>{needle ? "Select shown" : "Select all"}</button>
          <button type="button" className="font-semibold text-admin-brand underline-offset-2 hover:underline disabled:opacity-50" disabled={!selected.length} onClick={onClear}>Clear</button>
        </span>
      </div>
      <div role="group" aria-label="Drivers to include" className="grid max-h-52 grid-cols-1 gap-0.5 overflow-y-auto rounded-xl border border-admin-line p-1.5">
        {shown.length ? shown.map(option => (
          <label key={option.initials} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-admin-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-admin-brand">
            <input type="checkbox" className="accent-[var(--admin-brand,#7C3AED)]" checked={selected.includes(option.initials)} onChange={event => onToggle(option.initials, event.target.checked)} />
            <span className="min-w-0 truncate">{option.fullName || option.initials} <span className="text-admin-ink-2">({option.initials})</span>{option.active ? "" : <span className="text-admin-ink-2"> · inactive</span>}</span>
          </label>
        )) : <p className="px-2 py-3 text-[13px] text-admin-ink-2">No driver matches "{query}".</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ preview ---- */

export interface Metric { label: string; value: string; detail?: string; missing?: boolean }

export function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {metrics.map(metric => (
        <div key={metric.label} className="min-w-0 rounded-xl border border-admin-line bg-surface px-3 py-2.5">
          <dt className="text-[12px] font-medium text-admin-ink-2">{metric.label}</dt>
          <dd className={cx("mt-0.5 truncate text-[17px] font-bold leading-6 tabular-nums", metric.missing ? "text-admin-ink-2" : "text-admin-ink")}>{metric.value}</dd>
          {metric.detail && <dd className="mt-0.5 text-[11.5px] leading-4 text-admin-ink-2">{metric.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

const STATUS_TONE = (status: string) => (status === "COMPLETED" ? "success" : status === "CANCELLED" ? "neutral" : "info") as "success" | "neutral" | "info";
const columnByKey = (key: keyof JobLine) => JOB_COLUMNS.find(column => column.key === key)!;

export function PreviewTable({ rows, total, showDriver }: { rows: Array<{ driver: string; line: JobLine }>; total: number; showDriver: boolean }) {
  const text = (line: JobLine, key: keyof JobLine) => cellText(line, columnByKey(key));
  const cell = (value: string, extra?: string) => <td className={cx("whitespace-nowrap px-2.5 py-2", extra, value === NOT_AVAILABLE || value === "Not recorded" ? "text-admin-ink-2" : "")}>{value}</td>;
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-admin-line">
        <table className="w-full min-w-[320px] border-collapse text-left text-[12.5px]">
          <caption className="sr-only">The first {rows.length} of {total} jobs in this report</caption>
          <thead className="bg-admin-surface text-[11.5px] font-semibold uppercase tracking-wide text-admin-ink-2">
            <tr>
              <th scope="col" className="px-2.5 py-2">Job</th>
              <th scope="col" className="hidden px-2.5 py-2 sm:table-cell">Date</th>
              {showDriver && <th scope="col" className="hidden px-2.5 py-2 md:table-cell">Driver</th>}
              <th scope="col" className="px-2.5 py-2">Status</th>
              <th scope="col" className="px-2.5 py-2 text-right">Final charge</th>
              <th scope="col" className="hidden px-2.5 py-2 text-right md:table-cell">Working time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-line">
            {rows.map(({ driver, line }, index) => (
              <tr key={`${driver}-${line.jobId}-${index}`} className="text-admin-ink">
                <th scope="row" className="max-w-[9rem] truncate px-2.5 py-2 font-semibold tabular-nums">{line.jobId}</th>
                {cell(text(line, "date"), "hidden sm:table-cell")}
                {showDriver && <td className="hidden px-2.5 py-2 md:table-cell">{driver}</td>}
                <td className="px-2.5 py-2"><Badge tone={STATUS_TONE(line.status)}>{line.status}</Badge></td>
                {cell(text(line, "finalChargePence"), "text-right tabular-nums")}
                {cell(text(line, "workingMinutes"), "hidden text-right tabular-nums md:table-cell")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-admin-ink-2">{rows.length < total ? `Showing the first ${rows.length} of ${total} jobs. Every job is in the downloaded file.` : `All ${total} ${total === 1 ? "job" : "jobs"} shown.`}</p>
    </div>
  );
}

const DRIVER_STATE: Record<DriverLoadKind, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Waiting", icon: <CircleDashed aria-hidden className="h-4 w-4 text-admin-ink-2" /> },
  loading: { label: "Loading", icon: <Loader2 aria-hidden className="h-4 w-4 text-admin-brand motion-safe:animate-spin" /> },
  success: { label: "Loaded", icon: <CheckCircle2 aria-hidden className="h-4 w-4 text-admin-status-green" /> },
  empty: { label: "No jobs", icon: <MinusCircle aria-hidden className="h-4 w-4 text-admin-ink-2" /> },
  failed: { label: "Failed", icon: <XCircle aria-hidden className="h-4 w-4 text-admin-status-red" /> },
  cancelled: { label: "Cancelled", icon: <Ban aria-hidden className="h-4 w-4 text-admin-ink-2" /> }
};

export function ProgressPanel({ heading, done, total, drivers }: { heading: string; done: number; total: number; drivers: Array<{ code: string; name: string; kind: DriverLoadKind }> }) {
  const known = total > 1;
  return (
    <div className="space-y-3">
      <div role="progressbar" aria-label="Report progress" aria-valuemin={0} {...(known ? { "aria-valuemax": total, "aria-valuenow": done } : {})} className="h-2 overflow-hidden rounded-full bg-admin-surface">
        <div className={cx("h-full rounded-full bg-admin-brand", known ? "transition-[width] duration-300 motion-reduce:transition-none" : "w-1/3 motion-safe:animate-pulse")} style={known ? { width: `${Math.round((done / total) * 100)}%` } : undefined} />
      </div>
      <p className="sr-only">{heading}</p>
      {drivers.length > 1 && (
        <ul aria-label="Driver progress" className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {drivers.map(driver => (
            <li key={driver.code} className="flex min-w-0 items-center gap-2 rounded-lg border border-admin-line bg-surface px-2.5 py-1.5 text-[12.5px]">
              {DRIVER_STATE[driver.kind].icon}
              <span className="min-w-0 flex-1 truncate font-medium text-admin-ink">{driver.name}</span>
              <span className="shrink-0 text-admin-ink-2">{DRIVER_STATE[driver.kind].label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
