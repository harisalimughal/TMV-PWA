import React, { useState } from "react";
import { X, Send, Bell, Loader2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivers } from "../api";
import { Button, IconButton } from "../../../../ui";
import { useToast } from "../../../../components/ui/Toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SendBroadcastPushModal({ isOpen, onClose }: Props) {
  const toast = useToast();
  const [target, setTarget] = useState<string>("all");
  const [title, setTitle] = useState<string>("The Man Van Operations");
  const [body, setBody] = useState<string>("");
  const [url, setUrl] = useState<string>("/?tab=jobs");
  const [isSending, setIsSending] = useState(false);

  const { data: driversData } = useQuery({
    queryKey: ["broadcast_modal_drivers"],
    queryFn: () => fetchDrivers(),
    enabled: isOpen
  });

  if (!isOpen) return null;

  const drivers = driversData?.drivers || [];

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Please provide both a title and message body.");
      return;
    }

    try {
      setIsSending(true);
      const res = await fetch("/api/push/admin/broadcast", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          url,
          driverInitials: target !== "all" ? target : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to broadcast push notification");

      toast.success(
        target === "all"
          ? `Push notification broadcasted to ${data.result?.sent ?? 0} active device(s)!`
          : `Push notification sent to ${target} (${data.result?.sent ?? 0} device(s))!`
      );
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-module shadow-2xl w-full max-w-[520px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-admin-line flex items-center justify-between bg-[#FAFAFA] shrink-0">
          <h2 className="text-title text-fg flex items-center gap-2">
            <Bell className="w-5 h-5 text-admin-brand" /> Send Push Notification
          </h2>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} className="-mr-2" />
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Target Audience */}
          <div>
            <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Recipient</label>
            <div className="relative">
              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="w-full h-10 px-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
              >
                <option value="all">📢 Broadcast to All Active Drivers</option>
                {drivers.map(d => (
                  <option key={d.initials} value={d.initials}>
                    Driver: {d.fullName || d.initials} ({d.initials})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Notification Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Schedule Update"
              className="w-full h-10 px-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
            />
          </div>

          {/* Message Body */}
          <div>
            <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Message Content</label>
            <textarea
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="e.g. New jobs have been allocated for tomorrow. Please check your schedule."
              className="w-full p-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition resize-none"
            />
          </div>

          {/* Target Deep Link */}
          <div>
            <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Tap Destination URL</label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="/?tab=jobs"
              className="w-full h-10 px-3 rounded-card border border-admin-line bg-admin-surface text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface-sunken px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!title.trim() || !body.trim() || isSending}
            iconLeft={isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          >
            {isSending ? "Sending Push…" : "Send Notification"}
          </Button>
        </div>
      </div>
    </div>
  );
}
