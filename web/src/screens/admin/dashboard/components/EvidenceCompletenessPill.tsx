import React from "react";
import { Check, Loader2, AlertCircle, Circle } from "lucide-react";
import { EvidenceState } from "../types";

interface Props {
  completeness: {
    arrival: EvidenceState;
    vanLoaded: EvidenceState;
    emptyVan: EvidenceState;
    organized: EvidenceState;
    signature: EvidenceState;
  };
}

const ITEMS: Array<{ key: keyof Props["completeness"]; label: string; short: string }> = [
  { key: "arrival", label: "Arrival Photo", short: "ARR" },
  { key: "vanLoaded", label: "Van Loaded Photo", short: "LOAD" },
  { key: "emptyVan", label: "Empty Van Photo", short: "EMPTY" },
  { key: "organized", label: "Organized Photo", short: "ORG" },
  { key: "signature", label: "Customer Sign-Off", short: "SIG" }
];

export function EvidenceCompletenessPill({ completeness }: Props) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-admin-surface-2/80 rounded-lg border border-admin-line shadow-2xs">
      {ITEMS.map(({ key, label, short }) => {
        const state = completeness[key];

        let stateStyles = "bg-slate-100/60 text-slate-400 border-slate-200";
        let icon = <Circle className="w-2.5 h-2.5" />;

        if (state === "COMPLETED") {
          stateStyles = "bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-2xs";
          icon = <Check className="w-2.5 h-2.5 stroke-[3.5]" />;
        } else if (state === "PROCESSING") {
          stateStyles = "bg-amber-50 text-amber-700 border-amber-300 font-bold animate-pulse";
          icon = <Loader2 className="w-2.5 h-2.5 animate-spin" />;
        } else if (state === "FAILED") {
          stateStyles = "bg-rose-50 text-rose-700 border-rose-300 font-bold";
          icon = <AlertCircle className="w-2.5 h-2.5" />;
        } else if (state === "MISSING") {
          stateStyles = "bg-slate-100 text-slate-400 border-slate-200";
          icon = <Circle className="w-2 h-2 opacity-60" />;
        }

        return (
          <div
            key={key}
            title={`${label}: ${state}`}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-mono uppercase tracking-wider border transition ${stateStyles}`}
          >
            {icon}
            <span>{short}</span>
          </div>
        );
      })}
    </div>
  );
}
