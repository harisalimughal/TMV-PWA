/**
 * Booking OS shared components. Colour comes only from the `.bos` tokens (bookingTheme.css); every status keeps a text
 * label, and every component has its loading, empty and error forms so screens never improvise them.
 */
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Inbox, RefreshCw, X } from "lucide-react";
import { useDialogFocus } from "../../../../ui/useDialogFocus";
import { cx } from "../../../../ui/cx";
import type { Tone } from "../../../../lib/booking";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--bos-surface-3)] text-[var(--bos-ink-2)]",
  info: "bg-[var(--bos-azure-soft)] text-[var(--bos-azure-fg)]",
  success: "bg-[var(--bos-emerald-soft)] text-[var(--bos-emerald-fg)]",
  warning: "bg-[var(--bos-amber-soft)] text-[var(--bos-amber-fg)]",
  danger: "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)]",
  violet: "bg-[var(--bos-violet-soft)] text-[var(--bos-violet-fg)]",
  cyan: "bg-[var(--bos-cyan-soft)] text-[var(--bos-cyan-fg)]"
};
const DOT: Record<Tone, string> = { neutral: "var(--bos-ink-3)", info: "var(--bos-azure)", success: "var(--bos-emerald)", warning: "var(--bos-amber)", danger: "var(--bos-coral)", violet: "var(--bos-violet)", cyan: "var(--bos-cyan)" };

export const toneClass = (tone: Tone) => TONE[tone];

export function BosRoot({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("bos p-4 sm:p-6", className)}>{children}</div>;
}

export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5", TONE[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[tone] }} />{children}
    </span>
  );
}

export function Card({ title, subtitle, action, children, className, as: Tag = "section" }: { title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; as?: "section" | "div" }) {
  return (
    <Tag className={cx("bos-card p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">{title && <h2 className="text-[15px] font-semibold text-[var(--bos-ink)]">{title}</h2>}{subtitle && <p className="mt-0.5 text-[13px] text-[var(--bos-ink-2)]">{subtitle}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** The one place a missing figure is written, so it can never be shown as 0. */
export function Missing({ reason }: { reason?: string }) {
  return <span className="font-medium text-[var(--bos-ink-3)]" title={reason}>Not available</span>;
}

export type Accent = "azure" | "cyan" | "violet" | "emerald" | "amber" | "coral";

export function KpiCard({ label, value, hint, accent = "azure", icon, unavailableReason }: { label: string; value: React.ReactNode | null; hint?: React.ReactNode; accent?: Accent; icon?: React.ReactNode; unavailableReason?: string }) {
  return (
    <div className="bos-card relative overflow-hidden p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--bos-ink-2)]">{label}</p>
        {icon && <span aria-hidden className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `var(--bos-${accent}-soft)`, color: `var(--bos-${accent}-fg)` }}>{icon}</span>}
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-8 tracking-tight text-[var(--bos-ink)]">{value === null ? <span className="text-[18px]"><Missing reason={unavailableReason} /></span> : value}</p>
      {value === null && unavailableReason && <p className="mt-1 text-[12px] text-[var(--bos-ink-3)]">{unavailableReason}</p>}
      {value !== null && hint && <p className="mt-1 text-[12px] text-[var(--bos-ink-3)]">{hint}</p>}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `var(--bos-${accent})`, opacity: 0.55 }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("bos-skeleton", className ?? "h-4 w-full")} />;
}

export function LoadingBlock({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-[var(--bos-line-strong)] px-6 py-10 text-center">
      <Inbox aria-hidden className="h-6 w-6 text-[var(--bos-ink-3)]" />
      <p className="text-[15px] font-semibold text-[var(--bos-ink)]">{title}</p>
      {body && <p className="max-w-md text-[13px] text-[var(--bos-ink-2)]">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "This could not be loaded", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[var(--bos-coral)] bg-[var(--bos-coral-soft)] p-4">
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[var(--bos-coral-fg)]" />
      <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-[var(--bos-coral-fg)]">{title}</p>{message && <p className="mt-0.5 text-[13px] text-[var(--bos-ink-2)]">{message}</p>}</div>
      {onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw aria-hidden className="h-3.5 w-3.5" />Retry</Button>}
    </div>
  );
}

export function Button({ variant = "secondary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[var(--bos-primary)] text-[var(--bos-on-accent)] hover:brightness-95 border-transparent",
    secondary: "bg-[var(--bos-surface)] text-[var(--bos-ink)] border-[var(--bos-line-strong)] hover:bg-[var(--bos-surface-2)]",
    ghost: "bg-transparent text-[var(--bos-ink-2)] border-transparent hover:bg-[var(--bos-surface-2)]",
    danger: "bg-[var(--bos-coral-soft)] text-[var(--bos-coral-fg)] border-[var(--bos-coral)] hover:brightness-95"
  }[variant];
  return <button type="button" {...props} className={cx("inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", styles, className)} />;
}

/** Labelled sample-data banner: shown whenever the page is not reading the live backend. */
export function SampleBanner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--bos-amber)] bg-[var(--bos-amber-soft)] px-4 py-3">
      <StatusPill tone="warning">Sample data</StatusPill>
      <p className="min-w-0 flex-1 text-[13px] text-[var(--bos-ink)]">{children}</p>
      {action}
    </div>
  );
}

/** Secondary navigation: a tablist-free link row (these are views of one page, kept in the URL). */
export function SecondaryNav<T extends string>({ items, value, onChange, label }: { items: Array<{ id: T; label: string; count?: number | null }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <nav aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--bos-line)] bg-[var(--bos-surface)] p-1 [scrollbar-width:none]">
      {items.map(item => (
        <button key={item.id} type="button" aria-current={item.id === value ? "page" : undefined} onClick={() => onChange(item.id)}
          className={cx("inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-colors", item.id === value ? "bg-[var(--bos-primary)] text-[var(--bos-on-accent)]" : "text-[var(--bos-ink-2)] hover:bg-[var(--bos-surface-2)]")}>
          {item.label}
          {item.count !== undefined && item.count !== null && <span className={cx("rounded-full px-1.5 text-[11px]", item.id === value ? "bg-white/25" : "bg-[var(--bos-surface-3)]")}>{item.count}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Radial gauge from one real percentage; unknown renders the Missing form, not an empty ring. */
export function RadialGauge({ pct, label, accent = "violet" }: { pct: number | null; label: string; accent?: Accent }) {
  if (pct === null) return <div className="grid h-32 place-items-center text-[13px]"><Missing reason={`${label} cannot be calculated from the data available`} /></div>;
  const size = 128, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r, shown = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mx-auto h-32 w-32" role="img" aria-label={`${label}: ${Math.round(shown)} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bos-surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--bos-${accent})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * shown) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[22px] font-semibold text-[var(--bos-ink)]">{Math.round(shown)}%</span>
    </div>
  );
}

/** Donut from real segments; zero-sum renders nothing misleading. */
export function Donut({ segments, label }: { segments: Array<{ label: string; value: number; accent: Accent }>; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <EmptyState title="Nothing to chart yet" />;
  const size = 128, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${segments.map(s => `${s.label} ${s.value}`).join(", ")}`}>
        {segments.filter(s => s.value > 0).map(s => {
          const length = (s.value / total) * c, node = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--bos-${s.accent})`} strokeWidth={stroke} strokeDasharray={`${Math.max(0, length - 2)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          offset += length;
          return node;
        })}
      </svg>
      <ul className="space-y-1.5 text-[13px]">
        {segments.map(s => <li key={s.label} className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--bos-${s.accent})` }} /><span className="text-[var(--bos-ink-2)]">{s.label}</span><span className="font-semibold text-[var(--bos-ink)]">{s.value}</span></li>)}
      </ul>
    </div>
  );
}

/**
 * Centred workspace dialog. Rendered through a portal (so it sits above the admin shell) inside its own `.bos`
 * wrapper (so the Booking OS tokens still apply); focus is trapped and returned by the shared dialog stack.
 */
export function BosDialog({ open, onClose, title, subtitle, badges, tabs, children }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; badges?: React.ReactNode; tabs?: React.ReactNode; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(open, panel, onClose);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="bos fixed inset-0 z-[80] grid place-items-center p-0 sm:p-6" style={{ background: "transparent" }}>
      <div aria-hidden className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-[var(--bos-canvas)] shadow-2xl outline-none sm:rounded-3xl sm:border sm:border-[var(--bos-line)]" style={{ height: "min(860px, 100%)" }}>
        <header className="border-b border-[var(--bos-line)] bg-[var(--bos-surface)] px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 id={titleId} className="truncate text-[18px] font-semibold text-[var(--bos-ink)]">{title}</h2>{subtitle && <p className="text-[13px] text-[var(--bos-ink-2)]">{subtitle}</p>}</div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--bos-ink-2)] hover:bg-[var(--bos-surface-2)]"><X aria-hidden className="h-5 w-5" /></button>
          </div>
          {badges && <div className="mt-2 flex flex-wrap gap-2">{badges}</div>}
          {tabs && <div className="mt-3">{tabs}</div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>, document.body);
}

/** WAI-ARIA tabs with roving focus; the owner renders the panel with `role="tabpanel"` and `aria-labelledby={`${idBase}-${id}`}`. */
export function BosTabs<T extends string>({ tabs, value, onChange, label, idBase }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void; label: string; idBase: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, tabs.findIndex(t => t.id === value));
  const move = (index: number) => { onChange(tabs[index].id); refs.current[index]?.focus(); };
  useEffect(() => { refs.current[current]?.scrollIntoView?.({ inline: "nearest", block: "nearest" }); }, [current]);
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto [scrollbar-width:none]"
      onKeyDown={event => {
        const target = event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (target >= 0) { event.preventDefault(); move(target); }
      }}>
      {tabs.map((tab, i) => (
        <button key={tab.id} ref={node => { refs.current[i] = node; }} id={`${idBase}-${tab.id}`} role="tab" type="button" aria-selected={tab.id === value} aria-controls={`${idBase}-panel`} tabIndex={tab.id === value ? 0 : -1} onClick={() => onChange(tab.id)}
          className={cx("min-h-10 shrink-0 border-b-2 px-3.5 text-[13px] font-semibold", tab.id === value ? "border-[var(--bos-primary)] text-[var(--bos-ink)]" : "border-transparent text-[var(--bos-ink-2)] hover:text-[var(--bos-ink)]")}>{tab.label}</button>
      ))}
    </div>
  );
}
