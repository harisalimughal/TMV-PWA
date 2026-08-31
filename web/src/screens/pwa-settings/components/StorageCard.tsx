import React, { useState } from "react";
import { Database, Trash2 } from "lucide-react";
import { Button, ProgressBar } from "../../../ui";
import { useToast } from "../../../components/ui/Toast";
import { useStorageEstimate } from "../hooks/useStorageEstimate";
import { clearAppCaches, formatBytes } from "../../../lib/pwa/caches";
import { SettingCard } from "./SettingCard";
import { ClearCacheDialog } from "./ClearCacheDialog";

/**
 * Section 8: storage usage + a *safe* cache clear.
 *
 * `clearAppCaches()` only deletes regenerable Workbox caches. The offline outbox
 * (IndexedDB `tmv-outbox`), theme, avatar and auth session are all untouched.
 */
export function StorageCard() {
  const { supported, loading, usage, quota, ratio, refresh } = useStorageEstimate();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleClear() {
    try {
      const result = await clearAppCaches();
      if (result.unsupported) {
        toast.error("Cached data can't be cleared in this browser.");
        return;
      }
      if (result.failed.length > 0 && result.cleared.length === 0) {
        toast.error("Couldn't clear cached data. Please try again.");
        return;
      }
      toast.success("Cached app data cleared");
      await refresh();
    } catch {
      toast.error("Couldn't clear cached data. Please try again.");
    }
  }

  return (
    <SettingCard
      icon={<Database />}
      title="Storage"
      description="Manage cached app resources stored on this device."
    >
      <div className="flex flex-col gap-4">
        {supported ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-heading text-fg tabular-nums">
                {loading ? "…" : `${formatBytes(usage)} used`}
              </span>
              {!loading && quota > 0 && (
                <span className="text-meta text-fg-subtle tabular-nums">
                  of ~{formatBytes(quota)} available
                </span>
              )}
            </div>
            <ProgressBar
              value={ratio}
              aria-label="Share of available storage in use"
            />
          </div>
        ) : (
          <p className="text-helper text-fg-subtle">
            This browser doesn't report storage usage. You can still clear cached app
            files below.
          </p>
        )}

        <Button
          variant="secondary"
          size="md"
          fullWidth
          iconLeft={<Trash2 />}
          onClick={() => setDialogOpen(true)}
        >
          Clear Cached App Data
        </Button>
      </div>

      <ClearCacheDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleClear}
      />
    </SettingCard>
  );
}
