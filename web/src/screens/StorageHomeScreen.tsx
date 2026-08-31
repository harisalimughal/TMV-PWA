import React from "react";
import { PackageMinus, PackagePlus } from "lucide-react";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import { StorageActionCard, StorageActivity } from "../components/driver";
import { Badge } from "../ui";
import { useOnline, useQueuedStorage } from "../lib/net";

interface StorageHomeScreenProps {
  onOpenScenario: (scenario: "checkin" | "checkout") => void;
}

/**
 * The Storage tab — an operational hub around two actions: record items in, release
 * items out. There is no storage-history endpoint, so the only activity shown is
 * real: storage records made offline that are still queued to sync.
 */
export function StorageHomeScreen({ onOpenScenario }: StorageHomeScreenProps) {
  const online = useOnline();
  const queued = useQueuedStorage();

  const status =
    queued.length > 0 ? (
      <Badge tone="warning" dot>
        {queued.length} awaiting sync
      </Badge>
    ) : !online ? (
      <Badge tone="neutral" dot>
        Offline
      </Badge>
    ) : null;

  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content">
      <div className="px-4 pb-4 pt-5 scroll-pb-nav">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-title text-fg">Storage</h1>
            <p className="mt-1 text-body text-fg-muted">
              Manage items entering and leaving storage.
            </p>
          </div>
          {status && <div className="shrink-0 pt-1">{status}</div>}
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <StorageActionCard
            eyebrow="Inbound"
            title="Check in"
            description="Record items entering storage"
            icon={<PackagePlus aria-hidden />}
            accent="brand"
            onClick={() => onOpenScenario("checkin")}
          />
          <StorageActionCard
            eyebrow="Outbound"
            title="Check out"
            description="Release items from storage"
            icon={<PackageMinus aria-hidden />}
            accent="neutral"
            onClick={() => onOpenScenario("checkout")}
          />
        </div>

        {queued.length > 0 && <StorageActivity items={queued} className="mt-7" />}
      </div>
    </AppShell>
  );
}
