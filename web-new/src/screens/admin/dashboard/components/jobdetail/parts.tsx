/** Small pieces shared by the job preview tabs. */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { fetchDrivers } from "../../../../../api/admin";
import type { NormalizedJob } from "../../types";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "../ds";

export function Block({ title, children, description, aside, id }: { title: string; children: React.ReactNode; description?: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-admin-line bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={id} className="text-[15px] font-semibold text-admin-ink">{title}</h3>
        {aside && <div className="text-[13px] text-admin-ink-2">{aside}</div>}
      </div>
      {description && <p className="mt-0.5 text-[13px] text-admin-ink-2">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Copies text and says so. Clipboard failures are silent: the value is still on screen. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" aria-label={label} onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
      className={cx("inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing, className)}>
      {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-admin-status-green" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/** The assigned driver's roster record (van registration lives there, not on the job). */
export function useRosterDriver(job: Pick<NormalizedJob, "driverInitials">) {
  const roster = useQuery({ queryKey: ["admin_driver_options"], queryFn: fetchDrivers, staleTime: 60 * 60 * 1000, retry: 0 });
  return roster.data?.find(driver => driver.initials === job.driverInitials);
}

export const TEXT_MISSING = { driver: "Not assigned", submission: "Not submitted", unknown: "Unknown", unavailable: "Not available", recorded: "Not recorded" } as const;
