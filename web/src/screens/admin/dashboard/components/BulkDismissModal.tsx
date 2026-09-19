import React, { useState } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  count: number;
  /** Singular noun, e.g. "notification" or "alert". */
  itemLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms hiding rows from the Notifications or Alerts tab. Unlike JobsPage's
 * BulkDeleteModal, this never deletes anything real -- both tabs are computed live
 * (notifications from jobs+activity, alerts proxied from GPSLive), so this only
 * records the row's id as dismissed so it's filtered back out on future loads (see
 * db/dismissals.repo.ts). The copy says so plainly rather than implying a real delete.
 */
export function BulkDismissModal({ count, itemLabel, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err?.message || `Couldn't remove the selected ${itemLabel}s.`);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-admin-ink/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-dismiss-title"
        className="bg-white rounded-module shadow-2xl w-full max-w-[460px] p-6 animate-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-admin-status-red-bg flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-admin-status-red" />
          </div>
          <div>
            <h2 id="bulk-dismiss-title" className="text-title text-fg">
              Remove {count} {itemLabel}{count === 1 ? "" : "s"}?
            </h2>
            <p className="text-[13px] text-admin-muted mt-1.5">
              This removes the selected {itemLabel}{count === 1 ? "" : "s"} from this list for everyone. It doesn't
              change anything else.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-[13px] text-admin-status-red mt-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-card bg-admin-surface text-card text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 h-11 rounded-card bg-admin-status-red text-white text-[14px] font-semibold disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
