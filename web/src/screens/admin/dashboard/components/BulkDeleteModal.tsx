import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteJob } from "../api";

interface Props {
  jobIds: string[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Confirms and runs a bulk (or single) job delete. Jobs mirror their Calendar event, so
 * the backend deletes the event first and only removes the Mongo record once that's
 * confirmed gone -- see jobs.routes.ts's DELETE /:jobId. Sequential, not Promise.all,
 * same reasoning as BulkReassignModal: the progress counter stays truthful and a
 * partial failure leaves a clear record of how far it got.
 */
export function BulkDeleteModal({ jobIds, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const jobId of jobIds) {
        await deleteJob(jobId);
        setDone(n => n + 1);
      }
      onDone();
    } catch (err: any) {
      setError(err?.message || "Couldn't delete every job. Some may have been removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-admin-ink/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
        className="bg-white rounded-module shadow-2xl w-full max-w-[460px] p-6 animate-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-admin-status-red-bg flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-admin-status-red" />
          </div>
          <div>
            <h2 id="bulk-delete-title" className="text-title text-fg">
              Delete {jobIds.length} job{jobIds.length === 1 ? "" : "s"}?
            </h2>
            <p className="text-[13px] text-admin-muted mt-1.5">
              This permanently deletes the job{jobIds.length === 1 ? "" : "s"} and its linked Calendar event, along
              with any photos, signatures and financial records attached to it. This cannot be undone.
            </p>
          </div>
        </div>

        {busy && (
          <p className="text-[13px] text-admin-muted mt-4" role="status">
            Deleting… {done} of {jobIds.length}
          </p>
        )}
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
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
