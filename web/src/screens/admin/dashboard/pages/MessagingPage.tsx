import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Pencil, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { fetchMessages, MessageAudience, MessageCatalogItem, saveMessageTemplate, toggleMessage } from "../api";
import { Button, Modal, SegmentedControl, Switch } from "../../../../ui";
import { ApiErrorState } from "../components/ApiErrorState";

// The real, single-shared placeholder syntax renderMessageTemplate() (src/notifications/
// message.ts and message-catalog.ts) actually substitutes -- not every message supports
// every token, see each item's own `variables` from the API.
const MOCK_DATA: Record<string, string> = {
  "{customerName}": "Sarah Jenkins",
  "{NAME}": "Sarah Jenkins",
  "{companyName}": "The Man Van",
  "{pickup}": "142 Battersea Park Road, London",
  "{dropoff}": "45 Depot Road, London",
  "{driverPhone}": "07455 123456",
  "{vanRegistration}": "LV24 MVO",
  "{driver_name}": "James Dean",
  "{job_time}": "9:00 AM",
  "{job_date}": "Monday 25 Aug",
  "{booking_date}": "Monday 25 Aug",
  "{leadMinutes}": "45",
  "{jobId}": "TMV-AB12CD34EF"
};

function renderPreview(content: string): string {
  let preview = content;
  for (const [token, value] of Object.entries(MOCK_DATA)) {
    preview = preview.split(token).join(value);
  }
  return preview;
}

const AUDIENCE_COPY: Record<MessageAudience, string> = {
  customer: "Every message the app sends to a customer, at any stage of the job.",
  driver: "Every message the app sends to a driver -- push notifications, SMS and email."
};

/**
 * Every message the app sends, in one place -- backed by notifications/message-catalog.ts
 * (the single source of truth for what exists, its settings keys and its default
 * on/off state). Customer/Driver tabs split the same flat list by audience; each row's
 * Switch calls POST /api/admin/messages/:id/toggle immediately (no separate save step --
 * disabling stops the next send right away, see every gated call site in the backend),
 * and the pencil opens the same editor+preview view the old flat Settings-style page
 * used, now shared across every message instead of 3 hardcoded cards.
 */
export function MessagingPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MessageAudience>("customer");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["messages"], queryFn: fetchMessages });

  const items = data?.items ?? [];
  const visible = items.filter(i => i.audience === tab);
  const editingItem = items.find(i => i.id === editingId) ?? null;

  const handleToggle = async (item: MessageCatalogItem, enabled: boolean) => {
    const previous = queryClient.getQueryData<{ items: MessageCatalogItem[] }>(["messages"]);
    // Optimistic -- a toggle should feel instant, and this list is small enough that a
    // full refetch on every flip would be a visible flicker for no benefit.
    queryClient.setQueryData(["messages"], (old: { items: MessageCatalogItem[] } | undefined) =>
      old ? { items: old.items.map(i => (i.id === item.id ? { ...i, enabled } : i)) } : old
    );
    try {
      await toggleMessage(item.id, enabled);
    } catch {
      if (previous) queryClient.setQueryData(["messages"], previous);
    }
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12">
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm">
        <p className="text-[14px] text-admin-muted max-w-3xl">
          Edit any message's text or switch it off entirely. Changes take effect immediately -- no deploy required.
        </p>
      </div>

      <div className="flex justify-center">
        <SegmentedControl
          aria-label="Message audience"
          value={tab}
          onChange={setTab}
          options={[
            { value: "customer" as const, label: "Customer" },
            { value: "driver" as const, label: "Driver" }
          ]}
        />
      </div>

      <p className="px-2 text-[13px] text-admin-muted">{AUDIENCE_COPY[tab]}</p>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading messages...</span>
        </div>
      )}

      {error && <ApiErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}

      {!isLoading && !error && visible.length === 0 && (
        <div className="bg-white rounded-module border border-admin-line shadow-sm p-12 text-center">
          <MessageSquare className="w-8 h-8 text-admin-muted mx-auto mb-3" />
          <h3 className="text-card text-fg">No messages configured</h3>
        </div>
      )}

      {!isLoading && !error && visible.length > 0 && (
        <div className="bg-white rounded-module border border-admin-line shadow-sm divide-y divide-admin-line overflow-hidden">
          {visible.map(item => (
            <div key={item.id} className="p-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-card text-fg">{item.label}</h3>
                  <span className="px-2 py-0.5 rounded-control bg-admin-surface border border-admin-line text-eyebrow text-fg-subtle">
                    {item.channel}
                  </span>
                  {!item.enabled && (
                    <span className="px-2 py-0.5 rounded-control bg-admin-status-red-bg text-admin-status-red text-eyebrow font-bold">
                      OFF
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-admin-muted mt-1 max-w-2xl">{item.hint}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={item.enabled}
                  onChange={enabled => handleToggle(item, enabled)}
                  aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.label}`}
                />
                <button
                  onClick={() => setEditingId(item.id)}
                  className="p-2 rounded-control text-admin-muted hover:bg-admin-surface hover:text-admin-ink transition"
                  title="Edit template"
                  aria-label={`Edit ${item.label}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingItem && (
        <MessageEditModal
          item={editingItem}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["messages"] });
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function MessageEditModal({
  item, onClose, onSaved
}: { item: MessageCatalogItem; onClose: () => void; onSaved: () => void }) {
  const [titleDraft, setTitleDraft] = useState(item.title ?? "");
  const [bodyDraft, setBodyDraft] = useState(item.body);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isSms = item.channel === "SMS";
  const chars = bodyDraft.length;
  const isSmsOverlimit = isSms && chars > 160;
  const unsaved = bodyDraft !== item.body || (item.hasTitle && titleDraft !== (item.title ?? ""));

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await saveMessageTemplate(item.id, item.hasTitle ? { title: titleDraft, body: bodyDraft } : { body: bodyDraft });
      onSaved();
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setBodyDraft(item.bodyFallback);
    if (item.hasTitle) setTitleDraft(item.titleFallback ?? "");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.label}
      size="lg"
      dismissible={!saving}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button variant="ghost" onClick={handleReset} iconLeft={<RotateCcw />}>
            Reset to default
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!unsaved || !bodyDraft.trim()} iconLeft={<Save />}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {saveError && (
          <p className="text-[12px] text-admin-status-red font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {saveError}
          </p>
        )}

        {item.variables.length > 0 && (
          <div>
            <span className="text-eyebrow text-fg-subtle tracking-wider block mb-2">Available Variables</span>
            <div className="flex flex-wrap gap-2">
              {item.variables.map(v => (
                <button
                  key={v}
                  onClick={() => setBodyDraft(d => d + v)}
                  className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-admin-brand text-[12px] font-medium border border-blue-200 transition"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.hasTitle && (
          <div>
            <label className="text-eyebrow text-fg-subtle tracking-wider block mb-2">Title</label>
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              className="w-full h-10 px-3 rounded-card border border-admin-line bg-white text-[14px] text-admin-ink shadow-sm outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition"
            />
          </div>
        )}

        <div>
          <label className="text-eyebrow text-fg-subtle tracking-wider block mb-2">{item.hasTitle ? "Body" : "Message"}</label>
          <textarea
            value={bodyDraft}
            onChange={e => setBodyDraft(e.target.value)}
            className="w-full h-40 p-4 rounded-card border border-admin-line bg-white text-[14px] font-mono text-admin-ink shadow-sm outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand resize-none transition"
            placeholder="Type message text here..."
          />
          {isSms && (
            <div className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${isSmsOverlimit ? "text-admin-status-red" : "text-admin-muted"}`}>
              {isSmsOverlimit && <AlertTriangle className="w-3.5 h-3.5" />}
              <span>{chars} characters (SMS standard is 160)</span>
            </div>
          )}
        </div>

        <div>
          <span className="text-eyebrow text-fg-subtle tracking-wider block mb-2">Live Preview</span>
          <div className="bg-[#FAFAFA] border border-admin-line rounded-card p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-admin-brand to-[#10b981]" />
            {item.hasTitle && (
              <div className="text-[14px] font-bold text-admin-ink mb-1.5">{renderPreview(titleDraft) || <span className="text-admin-muted italic font-normal">Empty title...</span>}</div>
            )}
            <div className="text-[14px] text-admin-ink whitespace-pre-wrap leading-relaxed">
              {renderPreview(bodyDraft) || <span className="text-admin-muted italic">Empty message...</span>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
