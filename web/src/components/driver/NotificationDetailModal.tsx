import React from "react";
import { createPortal } from "react-dom";
import { Bell, Clock, TriangleAlert } from "lucide-react";
import { Badge, Modal } from "../../ui";
import type { LoggedNotification } from "../../lib/pwa/notificationLog";

const LABELS = new Map([
  ["congestion_zone", "Congestion alert"], ["tunnel_zone", "Tunnel alert"],
  ["arrival_proof_overdue", "Arrival photo reminder"], ["broadcast_message", "Office message"]
]);
const ALERT_KINDS = new Set(["congestion_zone", "tunnel_zone", "arrival_proof_overdue"]);

export function NotificationDetailModal({ notification, onClose }: { notification: LoggedNotification | null; onClose: () => void }) {
  if (!notification) return null;
  const isAlert = ALERT_KINDS.has(notification.kind || "");
  const Icon = isAlert ? TriangleAlert : Bell;
  const timestamp = new Date(notification.receivedAt);
  const validTime = Number.isFinite(timestamp.getTime());
  return createPortal(<Modal open onClose={onClose} title="Notification details" placement="center" size="lg">
    <article className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={isAlert ? "warning" : "brand"}><Icon className="size-3.5" aria-hidden />{LABELS.get(notification.kind || "") || "Notification"}</Badge>
        <span className="flex items-center gap-1.5 text-meta text-fg-subtle"><Clock className="size-3.5" aria-hidden />
          {validTime ? <time dateTime={timestamp.toISOString()}>{new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(timestamp)} (London)</time> : "Time unavailable"}
        </span>
      </div>
      <h3 className="whitespace-pre-wrap text-[20px] font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{notification.title}</h3>
      <div className={`border-l-4 pl-4 ${isAlert ? "border-warning" : "border-brand"}`}>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg [overflow-wrap:anywhere]">{notification.body || "No message text provided."}</p>
      </div>
    </article>
  </Modal>, document.body);
}
