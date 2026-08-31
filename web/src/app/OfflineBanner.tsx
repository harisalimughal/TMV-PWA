import { useState } from "react";
import { useOnline, useQueuedCount } from "../lib/net";
import { flush } from "../lib/outbox";

/**
 * A thin operational status strip — part of the product, not a warning box. Shown
 * only when offline or when something is waiting to send. Amber rule + amber
 * text, no icon-in-a-box, no driver-facing jargon.
 */
export function OfflineBanner() {
  const online = useOnline();
  const queued = useQueuedCount();
  const [sending, setSending] = useState(false);

  if (online && queued === 0) return null;

  const label = !online
    ? queued > 0
      ? `Offline — ${queued} change${queued === 1 ? "" : "s"} waiting to sync`
      : "Offline — changes will sync when you're back on"
    : sending
      ? `Syncing ${queued} change${queued === 1 ? "" : "s"}…`
      : `${queued} change${queued === 1 ? "" : "s"} waiting to sync`;

  return (
    <div
      role="status"
      className="shrink-0 flex items-center gap-2 border-b border-warning-signal bg-warning-subtle px-4 py-1.5"
    >
      <span className="size-[6px] shrink-0 rounded-[1px] bg-warning-signal" aria-hidden />
      <span className="flex-1 text-eyebrow font-bold uppercase text-warning">{label}</span>
      {online && queued > 0 && (
        <button
          type="button"
          onClick={() => {
            setSending(true);
            void flush().finally(() => setSending(false));
          }}
          disabled={sending}
          className="shrink-0 text-eyebrow font-bold uppercase text-warning underline underline-offset-2 disabled:opacity-50"
        >
          {sending ? "Syncing…" : "Sync now"}
        </button>
      )}
    </div>
  );
}
