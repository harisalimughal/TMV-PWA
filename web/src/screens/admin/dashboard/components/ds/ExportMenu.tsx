import React from "react";
import { ChevronDown, Download } from "lucide-react";
import { Menu } from "../../../../../ui/Menu";
import { Action } from "./primitives";

export interface ExportOption {
  id: string;
  /** Format and action, e.g. "CSV". */
  label: string;
  /** What exactly ends up in the file, e.g. "All 36 filtered jobs, 7–13 Oct 2026". */
  scope: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** One labelled Export control per page. Every option states its scope so nobody
 *  mistakes a current-page export for a complete report (audit p.26). */
export function ExportMenu({ options, label = "Export" }: { options: ExportOption[]; label?: string }) {
  if (!options.length) return null;
  return (
    <Menu
      align="end"
      trigger={props => (
        <Action {...props} icon={<Download />} aria-label={`${label} options`}>
          {label}<ChevronDown aria-hidden className="h-4 w-4" />
        </Action>
      )}
      items={options.map(option => ({
        id: option.id,
        disabled: option.disabled,
        onSelect: option.onSelect,
        label: (
          <span className="flex min-w-0 flex-col py-0.5">
            <span className="text-[14px] font-semibold text-admin-ink">{option.label}</span>
            <span className="whitespace-normal text-[12.5px] text-admin-ink-2">{option.scope}</span>
          </span>
        )
      }))}
    />
  );
}
