import React, { useState } from "react";
import { deleteJob } from "../api";
import { Modal } from "../../../../ui/Modal";
import { Action } from "./ds";

interface Props {
  jobIds: string[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Confirms and runs a bulk (or single) job delete. Jobs mirror their Calendar event, so
 * the backend deletes the event first and only removes the record once that's
 * confirmed gone. Sequential so the progress count stays truthful and a partial
 * failure says exactly how far it got.
 */
export function BulkDeleteModal({ jobIds, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const count = jobIds.length;

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let completed = 0;
    try {
      for (const jobId of jobIds.slice(done)) {
        await deleteJob(jobId);
        completed++;
        setDone(previous => previous + 1);
      }
      onDone();
    } catch (err) {
      const removed = done + completed;
      setError(`${removed} of ${count} deleted. ${(err as Error)?.message || "The rest could not be deleted."}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Delete ${count} job${count === 1 ? "" : "s"} permanently?`} placement="center" dismissible={!busy}
      footer={<div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={busy}>Cancel</Action><Action variant="danger" loading={busy} onClick={() => void handleConfirm()}>{done > 0 ? "Retry remaining" : "Delete permanently"}</Action></div>}>
      <p className="text-[14px] text-admin-ink-2">
        This deletes the job{count === 1 ? "" : "s"} and the linked Calendar event{count === 1 ? "" : "s"}, along with attached photos, signatures and financial records.
        It cannot be undone.
      </p>
      {busy && <p role="status" className="mt-3 text-[13px] text-admin-ink-2">Deleting… {done} of {count}</p>}
      {error && <p role="alert" className="mt-3 text-[13px] text-admin-status-red">{error}</p>}
    </Modal>
  );
}
