import React from "react";
import { ConfirmDialog } from "../../../ui";

interface ClearCacheDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirmation for "Clear Cached App Data". Spells out exactly what is and isn't
 * removed. The actual clear (`clearAppCaches`) only deletes regenerable Workbox
 * caches — never IndexedDB, localStorage, cookies or the offline outbox.
 */
export function ClearCacheDialog({ open, onClose, onConfirm }: ClearCacheDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Clear cached app data?"
      body={
        <>
          This removes temporary app files stored on this device. Your account, saved
          job information and anything waiting to sync will not be deleted.
        </>
      }
      cancelLabel="Cancel"
      confirmLabel="Clear Cache"
      tone="brand"
    />
  );
}
