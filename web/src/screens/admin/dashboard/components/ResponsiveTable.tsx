import React from "react";

/**
 * Responsive table shell.
 *
 * The dashboard's tables run to 8-12 columns and were all wrapped in a bare
 * `overflow-x-auto`, which on a phone means a horizontal scrollbar over a layout that
 * was never designed to be read that way. This gives every table one consistent
 * treatment: the real table from `md` up, and a stack of cards below it.
 *
 * Pages supply `renderCard` for the mobile representation, so each one chooses which
 * three or four fields actually matter on a small screen rather than trying to shrink
 * all twelve.
 */

interface ResponsiveTableProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** The <thead>…</thead> and <tbody>…</tbody> for the desktop table. */
  table: React.ReactNode;
  renderCard: (item: T) => React.ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  isLoading?: boolean;
  loadingRows?: number;
}

export function ResponsiveTable<T>({
  items,
  keyOf,
  table,
  renderCard,
  emptyTitle = "Nothing to show",
  emptyBody = "Try widening the date range or clearing your filters.",
  isLoading = false,
  loadingRows = 6
}: ResponsiveTableProps<T>) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3" aria-busy="true">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div key={i} className="h-16 rounded-module skeleton" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center px-6 py-16">
        <h3 className="text-card text-fg">{emptyTitle}</h3>
        <p className="text-[13px] text-admin-muted mt-1.5 max-w-sm mx-auto leading-relaxed">{emptyBody}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: the real table. */}
      <div className="hidden md:block overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-[14px] border-collapse">{table}</table>
      </div>

      {/* Mobile: one card per row. */}
      <ul className="md:hidden list-none m-0 p-3 space-y-3">
        {items.map(item => (
          <li key={keyOf(item)}>{renderCard(item)}</li>
        ))}
      </ul>
    </>
  );
}

/** The card chrome, so every page's mobile row looks like it belongs to the same app. */
export function TableCard({
  onClick,
  children,
  highlighted = false
}: {
  onClick?: () => void;
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  const className = `w-full text-left rounded-module border bg-white p-4 transition ${
    highlighted ? "border-admin-status-amber/40 bg-admin-status-amber-bg" : "border-admin-line"
  } ${onClick ? "active:scale-[0.99] active:bg-admin-surface" : ""}`;

  if (!onClick) return <div className={className}>{children}</div>;
  return (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  );
}

/** A label/value pair for inside a TableCard. */
export function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mt-2">
      <span className="text-[12px] font-medium text-admin-muted shrink-0">{label}</span>
      <span className="text-[13px] text-admin-ink text-right min-w-0 truncate">{children}</span>
    </div>
  );
}
