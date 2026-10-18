/**
 * Shared building blocks for the admin dashboard (audit p.26 "one filter bar, empty
 * state, metric, status badge, table and drawer pattern").
 *
 * Visual rules kept in one place: white panels on the neutral ground, 1px hairline
 * borders, 10px panel / 8px control radii, a single restrained blue for actions and
 * selection, and status colour always paired with a text label.
 */
import React from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, RefreshCw, SearchX, XCircle } from "lucide-react";
import { cx } from "../../../../../ui/cx";

export const panel = "tmv-panel";
export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-brand";
export const controlBase = `h-10 rounded-xl border border-admin-line bg-surface px-3 text-[14px] text-admin-ink outline-none transition focus:border-admin-brand focus:ring-2 focus:ring-admin-brand/20 disabled:opacity-60`;

/* ----------------------------------------------------------------- buttons --- */

type ActionVariant = "primary" | "secondary" | "ghost" | "danger";
const ACTION: Record<ActionVariant, string> = {
  primary: "tmv-btn-primary border-transparent text-white",
  secondary: "border-admin-line bg-surface text-admin-ink hover:border-admin-brand/40 hover:bg-admin-brand-soft/60",
  ghost: "border-transparent bg-transparent text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink",
  danger: "border-transparent bg-[rgb(var(--danger-solid))] text-white hover:brightness-95"
};

export interface ActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  loading?: boolean;
}

/** The dashboard's button. Text label always visible unless `aria-label` is set and
 *  the caller deliberately renders an icon-only control. */
export const Action = React.forwardRef<HTMLButtonElement, ActionProps>(function Action(
  { variant = "secondary", size = "md", icon, loading, className, children, disabled, type = "button", ...rest }, ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-3.5 text-[14px]",
        ACTION[variant], focusRing, className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon ? <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden>{icon}</span> : null}
      {children}
    </button>
  );
});

/* ----------------------------------------------------------------- badges ---- */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-admin-surface text-admin-ink-2 border-admin-line",
  info: "bg-admin-brand-soft text-admin-brand-dark border-admin-brand/20",
  success: "bg-admin-status-green-bg text-admin-status-green border-admin-status-green/25",
  warning: "bg-admin-status-amber-bg text-admin-status-amber border-admin-status-amber/25",
  danger: "bg-admin-status-red-bg text-admin-status-red border-admin-status-red/25"
};
const DOT: Record<Tone, string> = {
  neutral: "bg-admin-muted", info: "bg-admin-brand", success: "bg-admin-status-green",
  warning: "bg-admin-status-amber", danger: "bg-admin-status-red"
};

/** Text + colour status label. Colour is never the only signal. */
export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-5", TONE[tone], className)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------- page header --- */

export interface Crumb { label: string; onClick?: () => void; href?: string }

export function PageHeader({ title, scope, breadcrumbs, actions, children }: {
  title: React.ReactNode;
  /** One line saying what the page covers: date range, timezone, record scope. */
  scope?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-admin-muted">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              {crumb.onClick || crumb.href ? (
                <a
                  href={crumb.href || "#"}
                  onClick={event => { if (crumb.onClick && !event.metaKey && !event.ctrlKey) { event.preventDefault(); crumb.onClick(); } }}
                  className={cx("rounded font-medium text-admin-brand hover:underline", focusRing)}
                >{crumb.label}</a>
              ) : (
                <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} className="truncate text-admin-ink-2">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-9 tracking-tight text-admin-ink md:text-[30px] md:leading-10">{title}</h1>
          {scope && <p className="mt-0.5 text-[14px] text-admin-ink-2">{scope}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Labelled back control ("Back to drivers"), used where a breadcrumb is too heavy. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("inline-flex min-h-10 items-center gap-1.5 rounded-lg pr-2 text-[14px] font-semibold text-admin-brand hover:underline", focusRing)}>
      <ChevronLeft aria-hidden className="h-4 w-4" />{label}
    </button>
  );
}

/* --------------------------------------------------------------- sections ---- */

export function Section({ title, description, actions, children, className, id, bodyClassName }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; id?: string; bodyClassName?: string;
}) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-title` : undefined} className={cx(panel, "overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-line px-4 py-3 md:px-5">
          <div className="min-w-0">
            {title && <h2 id={id ? `${id}-title` : undefined} className="text-[18px] font-semibold leading-6 text-admin-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-admin-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- metrics ---- */

export interface MetricProps {
  label: string;
  value: React.ReactNode;
  /** One short supporting line: basis, coverage or comparison. */
  detail?: React.ReactNode;
  tone?: "default" | "attention";
  onOpen?: () => void;
  openLabel?: string;
}

export function Metric({ label, value, detail, tone = "default", onOpen, openLabel }: MetricProps) {
  const body = (
    <>
      <span className="block text-[13px] font-medium text-admin-ink-2">{label}</span>
      <span className={cx("mt-1 block text-[24px] font-bold leading-8 tabular-nums tracking-tight", tone === "attention" ? "text-admin-status-amber" : "text-admin-ink")}>{value}</span>
      {detail && <span className="mt-0.5 block text-[12.5px] leading-[18px] text-admin-ink-2">{detail}</span>}
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={openLabel ? `${label}: ${typeof value === "string" || typeof value === "number" ? value : ""}. ${openLabel}` : undefined}
      className={cx("tmv-panel tmv-lift flex h-full w-full flex-col items-start justify-start p-4 text-left hover:border-admin-brand/50", focusRing)}>
      {body}
      {openLabel && <span className="mt-auto pt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-admin-brand">{openLabel}<ChevronRight aria-hidden className="h-3.5 w-3.5" /></span>}
    </button>
  ) : (
    <div className="tmv-panel h-full p-4">{body}</div>
  );
}

/** At most four metrics, in one row on desktop, two-up on tablet/mobile. */
export function MetricRow({ children, label }: { children: React.ReactNode; label?: string }) {
  const count = React.Children.toArray(children).filter(Boolean).length;
  if (import.meta.env.DEV && count > 4) console.warn(`MetricRow "${label ?? ""}" has ${count} metrics; the dashboard rule is four or fewer.`);
  return <div role="group" aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

/* ---------------------------------------------------------------- notices ---- */

const NOTICE: Record<"info" | "warning" | "danger" | "success", { box: string; icon: React.ReactNode }> = {
  info: { box: "border-admin-brand/20 bg-admin-brand-soft/60 text-admin-ink", icon: <Info className="h-4 w-4 text-admin-brand" /> },
  warning: { box: "border-admin-status-amber/30 bg-admin-status-amber-bg text-admin-ink", icon: <AlertTriangle className="h-4 w-4 text-admin-status-amber" /> },
  danger: { box: "border-admin-status-red/30 bg-admin-status-red-bg text-admin-ink", icon: <XCircle className="h-4 w-4 text-admin-status-red" /> },
  success: { box: "border-admin-status-green/30 bg-admin-status-green-bg text-admin-ink", icon: <CheckCircle2 className="h-4 w-4 text-admin-status-green" /> }
};

/** One consolidated note about coverage, partial data or a recoverable failure. */
export function Notice({ tone = "info", title, children, action, role }: {
  tone?: keyof typeof NOTICE; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; role?: "status" | "alert";
}) {
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={cx("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-[14px]", NOTICE[tone].box)}>
      <span aria-hidden className="mt-0.5 shrink-0">{NOTICE[tone].icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx("text-admin-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- data states ---- */

export function LoadingState({ label = "Loading", rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} aria-live="polite" className="space-y-2 p-4">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} aria-hidden className="tmv-shimmer h-11 rounded-xl motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this data", message, onRetry, compact = false }: {
  title?: string; message?: string; onRetry?: () => void; compact?: boolean;
}) {
  return (
    <div role="alert" className={cx("flex flex-col items-center gap-2 text-center", compact ? "px-4 py-6" : "px-6 py-12")}>
      <XCircle aria-hidden className="h-6 w-6 text-admin-status-red" />
      <p className="text-[15px] font-semibold text-admin-ink">{title}</p>
      {message && <p className="max-w-md text-[13px] text-admin-ink-2">{message}</p>}
      {onRetry && <Action size="sm" icon={<RefreshCw />} onClick={onRetry} className="mt-1">Try again</Action>}
    </div>
  );
}

/**
 * Empty result. `kind="no-matches"` is for "filters excluded everything" and should
 * carry a Clear filters / widen range action; `kind="empty"` is a genuinely empty
 * source.
 */
export function EmptyState({ title, message, actions, kind = "empty", compact = false }: {
  title: string; message?: React.ReactNode; actions?: React.ReactNode; kind?: "empty" | "no-matches"; compact?: boolean;
}) {
  return (
    <div role="status" className={cx("flex flex-col items-center gap-2 text-center", compact ? "px-4 py-6" : "px-6 py-12")}>
      {kind === "no-matches" ? <SearchX aria-hidden className="h-6 w-6 text-admin-muted" /> : <Info aria-hidden className="h-6 w-6 text-admin-muted" />}
      <p className="text-[15px] font-semibold text-admin-ink">{title}</p>
      {message && <div className="max-w-md text-[13px] text-admin-ink-2">{message}</div>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- pagination ---- */

/**
 * "1–25 of 36 jobs" with Previous/Next. Shows "0 jobs" and no buttons for an empty
 * result (audit: never "Showing 1–0 of 0"), and hides the buttons when everything
 * fits on one page.
 */
export function Pagination({ page, pageSize, total, onPage, noun = "record", label }: {
  page: number; pageSize: number; total: number; onPage: (page: number) => void; noun?: string; label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), pages);
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(safePage * pageSize, total);
  const nounText = total === 1 ? noun : `${noun}s`;
  return (
    <nav aria-label={label ?? `${noun} pages`} className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-line px-4 py-3 text-[13px] text-admin-ink-2">
      <span aria-live="polite">{total === 0 ? `0 ${nounText}` : pages === 1 ? `${total} ${nounText}` : `${first}–${last} of ${total} ${nounText}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Page {safePage} of {pages}</span>
          <Action size="sm" icon={<ChevronLeft />} disabled={safePage <= 1} onClick={() => onPage(safePage - 1)} aria-label="Previous page">Previous</Action>
          <Action size="sm" disabled={safePage >= pages} onClick={() => onPage(safePage + 1)} aria-label="Next page">Next<ChevronRight aria-hidden className="h-4 w-4" /></Action>
        </div>
      )}
    </nav>
  );
}

/* ----------------------------------------------------------- definition list --- */

export interface FactRow { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }

export function Facts({ rows, columns = 2, className }: { rows: FactRow[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {rows.map((row, index) => (
        <div key={index} className="min-w-0">
          <dt className="text-[12.5px] font-medium text-admin-ink-2">{row.label}</dt>
          <dd className={cx("mt-0.5 break-words text-[14px] font-medium", row.tone === "danger" ? "text-admin-status-red" : row.tone === "warning" ? "text-admin-status-amber" : "text-admin-ink")}>{row.value}</dd>
          {row.hint && <dd className="mt-0.5 text-[12.5px] text-admin-ink-2">{row.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Placeholder text for a value that is missing, in a muted style that cannot be
 *  mistaken for a real value. */
export function Missing({ children = "Not recorded" }: { children?: React.ReactNode }) {
  return <span className="text-admin-muted">{children}</span>;
}
