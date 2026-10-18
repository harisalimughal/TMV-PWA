import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, BellPlus, Check, Copy, ExternalLink } from "lucide-react";
import { groupByDay, statusLabel, type ActivityConversation } from "../../../../../lib/activity";
import { cx } from "../../../../../ui/cx";
import { markConversationRead } from "../../activityApi";
import { messageDriverHref } from "../../activityLinks";
import { useJobThread } from "../../hooks/useActivity";
import { navigateTo, updateUrlParams } from "../../navigation";
import { Action, Badge, EmptyState, ErrorState, LoadingState, focusRing } from "../ds";
import { ChatBubble } from "./ChatBubble";

const NEAR_BOTTOM_PX = 120;

export function ChatPane({ conversation, onBack }: { conversation: ActivityConversation; onBack: () => void }) {
  const { jobId } = conversation;
  const thread = useJobThread(jobId);
  const queryClient = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const seenCount = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [away, setAway] = useState(false);
  const [copied, setCopied] = useState(false);
  // Notifying uses the existing push notification system, so it only needs a driver on the job.
  const canNotify = Boolean(conversation.driver.initials) && conversation.jobStatus !== "CANCELLED";
  const notifyReason = !conversation.driver.initials ? "No driver is assigned to this job, so there is nobody to notify." : "This job was cancelled.";
  const newest = thread.entries[thread.entries.length - 1];

  const toBottom = (behavior: ScrollBehavior = "auto") => {
    const el = scroller.current; if (!el) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: calm });
    else el.scrollTop = el.scrollHeight;
  };

  // A different conversation always opens at the latest message.
  useLayoutEffect(() => { pinned.current = true; seenCount.current = 0; setUnseen(0); setAway(false); }, [jobId]);
  // New entries: follow them when the reader is at the bottom, otherwise count them instead of yanking the scroll.
  useLayoutEffect(() => {
    const count = thread.entries.length, added = count - seenCount.current;
    seenCount.current = count;
    if (thread.status !== "ready" || added <= 0) return;
    if (pinned.current) toBottom(added === count ? "auto" : "smooth");
    else setUnseen(n => n + added);
  }, [thread.entries.length, thread.status]);

  // Read state follows what the admin has actually been shown: the newest entry, in a visible tab, at the bottom.
  useEffect(() => {
    if (thread.status !== "ready" || !newest || !pinned.current || document.hidden) return;
    if (!conversation.unreadCount && !unseen) return;
    let live = true;
    markConversationRead(jobId, newest.id).then(() => {
      if (!live) return;
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    }).catch(() => { /* the count stays until the next successful mark; nothing to show for it */ });
    return () => { live = false; };
  }, [thread.status, newest?.id, jobId, conversation.unreadCount, unseen, queryClient]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (pinned.current && unseen) setUnseen(0);
    setAway(!pinned.current);
  };
  const copyId = () => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); };
    void navigator.clipboard?.writeText(jobId).then(done, () => { /* clipboard blocked: nothing to confirm */ });
  };

  const days = groupByDay(thread.entries);
  return (
    <section aria-label={`Conversation for job ${jobId}`} className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-admin-line bg-surface px-3 py-3 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-admin-ink-2 hover:bg-admin-surface md:hidden", focusRing)}><ArrowLeft aria-hidden className="h-5 w-5" /></button>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-admin-line bg-admin-surface text-[13px] font-semibold text-admin-ink-2">{conversation.driver.initials}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-admin-ink">{conversation.driver.name}</h2>
          <p className="truncate text-[12.5px] text-admin-ink-2">{conversation.jobId}{conversation.customerName ? ` · ${conversation.customerName}` : ""}</p>
        </div>
        <Badge tone={conversation.jobStatus === "COMPLETED" ? "success" : conversation.jobStatus === "CANCELLED" ? "danger" : conversation.jobStatus === "IN_PROGRESS" ? "info" : "neutral"}>{statusLabel(conversation.jobStatus, conversation.currentState)}</Badge>
        <button type="button" onClick={copyId} aria-label={copied ? "Job number copied" : `Copy job number ${jobId}`} title="Copy job number"
          className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-admin-ink-2 hover:bg-admin-surface", focusRing)}>
          {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
        </button>
        <Action variant="ghost" icon={<ExternalLink />} onClick={() => updateUrlParams({ job: jobId }, true)} aria-label={`Open job ${jobId}`}><span className="hidden sm:inline">Open job</span></Action>
      </header>

      {thread.reconnecting && <p role="status" className="border-b border-admin-line bg-admin-status-amber-bg px-4 py-1.5 text-center text-[12.5px] text-admin-ink">Reconnecting. What you see may be a little behind.</p>}

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-admin-surface/60 px-3 py-4 sm:px-5" tabIndex={0} aria-label="Messages">
        {thread.status === "loading" && <LoadingState label="Loading conversation" rows={4} />}
        {thread.status === "unavailable" && <EmptyState title="Activity is not available on this server" message="The server this dashboard is connected to does not provide job activity yet." />}
        {thread.status === "error" && <ErrorState title="This conversation could not be loaded" message={thread.error} onRetry={thread.retry} />}
        {thread.status === "ready" && (
          <>
            {thread.hasOlder && (
              <div className="mb-3 text-center">
                <Action variant="ghost" loading={thread.loadingOlder} onClick={thread.loadOlder}>Load earlier activity</Action>
              </div>
            )}
            {!thread.entries.length && <EmptyState compact title="Nothing recorded for this job yet" message="Steps the driver completes will appear here." />}
            {days.map(day => (
              <div key={day.key} className="mb-4">
                <p className="sticky top-0 z-[1] mx-auto mb-3 w-fit rounded-full border border-admin-line bg-surface px-3 py-0.5 text-[12px] font-semibold text-admin-ink-2">{day.label}</p>
                <ol className="space-y-2.5">{day.items.map(entry => <ChatBubble key={entry.id} entry={entry} />)}</ol>
              </div>
            ))}
          </>
        )}
      </div>

      {(unseen > 0 || away) && thread.status === "ready" && (
        <button type="button" onClick={() => { pinned.current = true; setUnseen(0); setAway(false); toBottom("smooth"); }}
          className={cx("absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-admin-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-admin-ink shadow-md", focusRing)}>
          <ArrowDown aria-hidden className="h-4 w-4" />{unseen > 0 ? `${unseen} new ${unseen === 1 ? "entry" : "entries"}` : "Jump to latest"}
        </button>
      )}

      <div className="flex flex-col items-end gap-1 border-t border-admin-line bg-surface px-3 py-3 sm:px-4">
        {thread.status === "ready" && !canNotify && <p className="text-[12.5px] text-admin-ink-2">{notifyReason}</p>}
        {thread.status === "ready" && (
          <a href={canNotify ? messageDriverHref({ driver: conversation.driver.initials, jobId }) : undefined} aria-disabled={!canNotify}
            title="Send a notification to this driver" aria-label="Notify the driver assigned to this job"
            onClick={event => { if (!canNotify) { event.preventDefault(); return; } if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); navigateTo(messageDriverHref({ driver: conversation.driver.initials, jobId })); }}
            className={cx("inline-flex h-11 items-center gap-2 rounded-full bg-admin-brand px-5 text-[14px] font-semibold text-white shadow-md transition hover:brightness-110 motion-reduce:transition-none", focusRing, !canNotify && "pointer-events-none opacity-50")}>
            <BellPlus aria-hidden className="h-4 w-4" />Notify Driver
          </a>
        )}
      </div>
    </section>
  );
}
