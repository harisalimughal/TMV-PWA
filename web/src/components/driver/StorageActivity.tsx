import React, { useState } from "react";
import { PackageMinus, PackagePlus } from "lucide-react";
import { Badge, Section, cx } from "../../ui";
import { useOnline } from "../../lib/net";
import { flush, type QueuedSubmission } from "../../lib/outbox";
import { formatDateKeyShort, londonDateKey, todayKey } from "../../lib/jobDates";

export interface StorageActivityProps {
  /** Storage submissions sitting in the offline outbox (already filtered upstream). */
  items: QueuedSubmission[];
  className?: string;
}

function scenarioOf(url: string): "checkin" | "checkout" | null {
  if (url.endsWith("/checkin")) return "checkin";
  if (url.endsWith("/checkout")) return "checkout";
  return null;
}

function whenLabel(ms: number): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(ms);
  const key = londonDateKey(new Date(ms));
  const day = key === todayKey() ? "Today" : formatDateKeyShort(key);
  return `${day} · ${time}`;
}

/**
 * Storage records the driver created while offline that haven't reached the server
 * yet. Real data from the outbox (src/lib/outbox.ts) — nothing is shown when the
 * queue is empty (the screen renders this section only then).
 */
export function StorageActivity({ items, className }: StorageActivityProps) {
  const online = useOnline();
  const [syncing, setSyncing] = useState(false);

  if (items.length === 0) return null;

  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  return (
    <Section
      title="Awaiting sync"
      className={className}
      aside={
        online ? (
          <button
            type="button"
            disabled={syncing}
            onClick={() => {
              setSyncing(true);
              void flush().finally(() => setSyncing(false));
            }}
            className="text-label font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        ) : undefined
      }
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
        {shown.map((item, i) => (
          <StorageActivityItem
            key={item.id}
            item={item}
            last={extra === 0 && i === shown.length - 1}
          />
        ))}
        {extra > 0 && (
          <p className="border-t border-line px-4 py-2.5 text-helper text-fg-subtle">
            {extra} more waiting to sync
          </p>
        )}
      </div>
    </Section>
  );
}

function StorageActivityItem({ item, last }: { item: QueuedSubmission; last: boolean }) {
  const isCheckIn = scenarioOf(item.url) === "checkin";
  const reference =
    item.fields.container_number || item.fields.client_name || "Storage record";

  return (
    <div className={cx("flex items-center gap-3 px-4 py-3", !last && "border-b border-line")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-sunken text-fg-muted [&_svg]:size-[18px]">
        {isCheckIn ? <PackagePlus aria-hidden /> : <PackageMinus aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label font-semibold text-fg">
          {isCheckIn ? "Checked in" : "Checked out"}
        </span>
        <span className="mt-0.5 block truncate text-helper text-fg-subtle">
          {reference} · {whenLabel(item.createdAt)}
        </span>
      </span>
      <Badge tone="warning">Queued</Badge>
    </div>
  );
}
