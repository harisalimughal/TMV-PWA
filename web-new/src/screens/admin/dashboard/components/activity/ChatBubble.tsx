import { CircleAlert, Radar, ScrollText } from "lucide-react";
import { arrivedLate, bubbleKind, clock, VERIFICATION_LABEL, type ActivityMessage } from "../../../../../lib/activity";
import { cx } from "../../../../../ui/cx";

/** Honest delivery wording for a message the office sent. Words only: no ticks, because nothing here is a read receipt. */
const DELIVERY: Record<string, string> = {
  recorded: "Saved",
  notified: "Saved · notification sent",
  notify_failed: "Saved · notification could not be sent"
};

export function ChatBubble({ entry }: { entry: ActivityMessage }) {
  const kind = bubbleKind(entry, "admin");
  const time = clock(entry.recordedAt);
  const late = arrivedLate(entry);
  const timeText = late ? `Happened ${clock(entry.occurredAt)} · received ${time}` : time;

  if (kind === "outgoing" || kind === "incoming") {
    const mine = kind === "outgoing";
    return (
      <li className={cx("flex", mine ? "justify-end" : "justify-start")} data-bubble={kind}>
        <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] shadow-sm sm:max-w-[70%]",
          mine ? "rounded-br-md bg-admin-brand text-white" : "rounded-bl-md border border-admin-line bg-surface text-admin-ink")}>
          <p className={cx("mb-0.5 text-[12px] font-semibold", mine ? "text-white/85" : "text-admin-ink-2")}>{mine ? "You (office)" : entry.actor.displayName}</p>
          <p className="whitespace-pre-wrap break-words">{entry.body}</p>
          <p className={cx("mt-1 text-[11.5px]", mine ? "text-white/80" : "text-admin-muted")}>
            {time}{mine && entry.delivery && <> · {DELIVERY[entry.delivery] ?? "Saved"}</>}
          </p>
        </div>
      </li>
    );
  }

  const Icon = kind === "warning" ? CircleAlert : kind === "tracker" ? Radar : kind === "legacy" ? ScrollText : null;
  return (
    <li className="flex justify-start" data-bubble={kind}>
      <div className={cx("max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-[14px] sm:max-w-[75%]",
        kind === "warning" ? "border-admin-status-amber/40 bg-admin-status-amber-bg text-admin-ink" : "border-admin-line bg-admin-surface text-admin-ink",
        kind === "tracker" && "border-dashed")}>
        <p className="flex items-start gap-1.5 font-semibold">
          {Icon && <Icon aria-hidden className={cx("mt-0.5 h-4 w-4 shrink-0", kind === "warning" ? "text-admin-status-amber" : "text-admin-muted")} />}
          <span className="min-w-0 break-words">{entry.title}</span>
        </p>
        {entry.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-admin-ink-2">{entry.body}</p>}
        <p className="mt-1 text-[11.5px] text-admin-muted">
          {timeText}
          {entry.verification !== "not_applicable" && <> · {kind === "legacy" ? "From the job record" : VERIFICATION_LABEL[entry.verification]}</>}
        </p>
      </div>
    </li>
  );
}
