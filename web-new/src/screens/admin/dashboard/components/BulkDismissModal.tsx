import React, { useState } from "react";
import { Modal } from "../../../../ui/Modal";
import { Action } from "./ds";

interface Props {
  count: number;
  /** Singular noun, e.g. "message row" or "fleet event". */
  itemLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms hiding rows from the delivery log or fleet events. Nothing real is deleted:
 * both lists are computed live (deliveries from jobs + activity, events proxied from
 * GPSLive), so this only records the ids as hidden. The underlying evidence remains.
 */
export function BulkDismissModal({ count, itemLabel, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); }
    catch (err) { setError((err as Error)?.message || `Couldn't hide the selected ${itemLabel}s.`); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Hide ${count} ${itemLabel}${count === 1 ? "" : "s"} from this list?`} placement="center" dismissible={!busy}
      footer={<div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={busy}>Cancel</Action><Action variant="primary" loading={busy} onClick={() => void confirm()}>Hide from list</Action></div>}>
      <p className="text-[14px] text-admin-ink-2">The rows stop appearing here. The underlying jobs, messages and tracker events are not deleted.</p>
      {error && <p role="alert" className="mt-3 text-[13px] text-admin-status-red">{error}</p>}
    </Modal>
  );
}
