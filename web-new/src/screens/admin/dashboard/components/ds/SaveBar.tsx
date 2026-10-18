import React from "react";
import { AlertTriangle, CheckCircle2, Save, XCircle } from "lucide-react";
import { cx } from "../../../../../ui/cx";
import { Action } from "./primitives";

export type SaveState =
  | { kind: "clean" }
  | { kind: "dirty"; count: number }
  | { kind: "saving"; done: number; total: number }
  | { kind: "saved" }
  | { kind: "failed"; message: string; count: number };

/**
 * Sticky save/discard bar for editors that batch changes (audit p.21). It states the
 * real outcome: how many changes are pending, which step a save is on, and whether
 * a failure was total or partial.
 */
export function SaveBar({ state, onSave, onDiscard, saveLabel = "Save changes" }: {
  state: SaveState; onSave: () => void; onDiscard: () => void; saveLabel?: string;
}) {
  if (state.kind === "clean") return null;
  const message =
    state.kind === "dirty" ? `${state.count} unsaved change${state.count === 1 ? "" : "s"}` :
    state.kind === "saving" ? `Saving ${Math.min(state.done + 1, state.total)} of ${state.total}…` :
    state.kind === "saved" ? "All changes saved" :
    state.message;
  const icon = state.kind === "saved" ? <CheckCircle2 className="h-4 w-4 text-admin-status-green" /> :
    state.kind === "failed" ? <XCircle className="h-4 w-4 text-admin-status-red" /> : <AlertTriangle className="h-4 w-4 text-admin-status-amber" />;
  return (
    <div className="sticky bottom-3 z-30 mt-4">
      <div role="status" aria-live="polite" className={cx("mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-2.5 shadow-md",
        state.kind === "failed" ? "border-admin-status-red/40" : "border-admin-line")}>
        <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-admin-ink"><span aria-hidden>{icon}</span>{message}</span>
        {state.kind !== "saved" && (
          <div className="flex items-center gap-2">
            <Action variant="ghost" onClick={onDiscard} disabled={state.kind === "saving"}>Discard</Action>
            <Action variant="primary" icon={<Save />} onClick={onSave} loading={state.kind === "saving"}>{state.kind === "failed" ? "Retry failed changes" : saveLabel}</Action>
          </div>
        )}
      </div>
    </div>
  );
}
