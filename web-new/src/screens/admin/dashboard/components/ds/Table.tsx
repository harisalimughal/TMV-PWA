import React from "react";
import { cx } from "../../../../../ui/cx";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Hide on narrower desktop widths; the mobile row view covers small screens. */
  hideBelow?: "lg" | "xl";
  width?: string;
  className?: string;
}

/**
 * Compact desktop table + stacked mobile rows from the same data (audit p.26
 * "promote time/customer/status into compact stacked rows"). Clicking a row calls
 * `onOpen`; every row also renders a real button via `openLabel` so keyboard and
 * screen-reader users have the same entry point.
 */
export function DataTable<T>({ rows, columns, keyOf, onOpen, openLabel, mobileRow, caption, rowTone, minWidth = 760, layout = "auto" }: {
  rows: T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  onOpen?: (row: T) => void;
  /** Accessible name of the open button, e.g. job => `Open job ${job.jobId}`. */
  openLabel?: (row: T) => string;
  mobileRow: (row: T) => React.ReactNode;
  caption: string;
  rowTone?: (row: T) => "default" | "attention" | "muted";
  minWidth?: number;
  /** "fixed": columns with a `width` keep it and the rest share what is left, so long
   *  text truncates instead of pushing trailing columns (like Open) out of the panel.
   *  Give at least one column no width so it can absorb the slack. */
  layout?: "auto" | "fixed";
}) {
  const hide = (column: Column<T>) => column.hideBelow === "xl" ? "hidden xl:table-cell" : column.hideBelow === "lg" ? "hidden lg:table-cell" : "";
  const align = (column: Column<T>) => column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";
  return (
    <>
      <div className="relative hidden md:block overflow-x-auto">
        <table className={cx("w-full border-collapse text-[14px]", layout === "fixed" && "table-fixed")} style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-admin-line bg-admin-surface/60">
              {columns.map(column => (
                <th key={column.id} scope="col" style={column.width ? { width: column.width } : undefined}
                  className={cx("h-10 whitespace-nowrap px-3 text-[12.5px] font-semibold text-admin-ink-2 first:pl-4 last:pr-4", align(column), hide(column))}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-line">
            {rows.map(row => {
              const tone = rowTone?.(row) ?? "default";
              return (
                <tr key={keyOf(row)}
                  onClick={onOpen ? event => { if (!(event.target as HTMLElement).closest("button,a,input,select,label")) onOpen(row); } : undefined}
                  className={cx("align-middle transition-colors", onOpen && "cursor-pointer hover:bg-admin-brand-soft/30",
                    tone === "attention" && "bg-admin-status-amber-bg/40", tone === "muted" && "text-admin-ink-2")}>
                  {columns.map(column => (
                    <td key={column.id} className={cx("h-[52px] px-3 py-2 first:pl-4 last:pr-4", align(column), hide(column), column.className)}>{column.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-admin-line md:hidden" aria-label={caption}>
        {rows.map(row => (
          <li key={keyOf(row)} className="relative">
            {onOpen ? (
              <button type="button" onClick={() => onOpen(row)} aria-label={openLabel?.(row)}
                className="block w-full px-4 py-3 text-left hover:bg-admin-surface focus-visible:bg-admin-brand-soft/40 focus-visible:outline-none">
                {mobileRow(row)}
              </button>
            ) : <div className="px-4 py-3">{mobileRow(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Primary + secondary line inside a table cell. */
export function CellStack({ primary, secondary, className }: { primary: React.ReactNode; secondary?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="truncate font-medium text-admin-ink">{primary}</div>
      {secondary && <div className="truncate text-[12.5px] text-admin-ink-2">{secondary}</div>}
    </div>
  );
}
