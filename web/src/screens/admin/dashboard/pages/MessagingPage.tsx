import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { EditableSetting, fetchSettings, saveSetting } from "../api";
import { Button } from "../../../../ui";

// The real, single-shared placeholder syntax renderMessageTemplate() (src/notifications/message.ts)
// actually substitutes -- not every setting supports every token, see VARIABLES_BY_KEY.
const MOCK_DATA: Record<string, string> = {
  "{customerName}": "Sarah Jenkins",
  "{companyName}": "The Man Van",
  "{pickup}": "142 Battersea Park Road, London",
  "{dropoff}": "45 Depot Road, London",
  "{driverPhone}": "07455 123456",
  "{vanRegistration}": "LV24 MVO",
  "{driver_name}": "James Dean",
  "{job_time}": "9:00 AM",
  "{job_date}": "Monday 25 Aug",
  "{booking_date}": "Monday 25 Aug"
};

// Keys used here are tmv-pwa's own real settings keys (see backend/src/admin/
// settings-spec.ts), not the old short aliases (confirmationText etc.) the source's
// now-replaced Sheets-backed settings.route.ts used.
const MESSAGING_KEYS = [
  "CUSTOMER_CONFIRMATION_TEXT", "JOB_STARTED_MESSAGE_TEXT",
  "REVIEW_REQUEST_EMAIL_TEXT", "JOB_COMPLETION_EMAIL_TEXT", "CLIENT_NOTIFICATION_OFFSET_MINUTES"
];

const VARIABLES_BY_KEY: Record<string, string[]> = {
  CUSTOMER_CONFIRMATION_TEXT: [],
  JOB_STARTED_MESSAGE_TEXT: ["{customerName}", "{companyName}", "{pickup}", "{dropoff}", "{driverPhone}", "{vanRegistration}", "{driver_name}", "{job_time}", "{job_date}"],
  REVIEW_REQUEST_EMAIL_TEXT: ["{customerName}", "{companyName}", "{pickup}", "{dropoff}", "{job_date}"],
  JOB_COMPLETION_EMAIL_TEXT: ["{customerName}", "{companyName}", "{pickup}", "{dropoff}", "{driver_name}", "{job_time}", "{job_date}"],
  CLIENT_NOTIFICATION_OFFSET_MINUTES: []
};

const CHANNELS_BY_KEY: Record<string, string[]> = {
  CUSTOMER_CONFIRMATION_TEXT: ["Signature pad"],
  JOB_STARTED_MESSAGE_TEXT: ["SMS", "Email"],
  REVIEW_REQUEST_EMAIL_TEXT: ["Email"],
  JOB_COMPLETION_EMAIL_TEXT: ["Email"],
  CLIENT_NOTIFICATION_OFFSET_MINUTES: ["Auto-scheduler"]
};

function renderPreview(content: string): string {
  let preview = content;
  for (const [token, value] of Object.entries(MOCK_DATA)) {
    preview = preview.split(token).join(value);
  }
  return preview;
}

// The 3 real admin-editable message templates the classic /admin panel's Settings tab
// exposes (src/admin/admin.routes.ts's EDITABLE_SETTINGS) -- rendered and saved
// through the same GET/POST /api/admin/settings the driver-facing cards actually read
// from (via getSetting()), not a disconnected mock with its own invented placeholder
// syntax and template categories the bot has no capability to send.
export function MessagingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["settings"], queryFn: () => fetchSettings() });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const settings = (data?.settings ?? []).filter(s => MESSAGING_KEYS.includes(s.key));

  useEffect(() => {
    if (!data) return;
    setDrafts(prev => {
      const next = { ...prev };
      for (const s of data.settings) {
        if (!(s.key in next)) next[s.key] = s.value;
      }
      return next;
    });
  }, [data]);

  const draftFor = (s: EditableSetting) => drafts[s.key] ?? s.value;
  const isUnsaved = (s: EditableSetting) => draftFor(s) !== s.value;

  const handleSave = async (s: EditableSetting) => {
    setSavingKey(s.key);
    setSaveErrors(prev => ({ ...prev, [s.key]: "" }));
    try {
      await saveSetting(s.key, draftFor(s));
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err: any) {
      setSaveErrors(prev => ({ ...prev, [s.key]: err?.message || "Failed to save." }));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm">
        <h2 className="text-title text-fg mb-1">Content / Messaging Management</h2>
        <p className="text-[14px] text-admin-muted max-w-3xl">
          Edit the customer-facing text the Start Job workflow actually sends. Changes save immediately and
          take effect on the driver's very next job -- no deploy required.
        </p>
      </div>

      {isLoading && (
        <div className="h-64 bg-white rounded-module border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading templates...</span>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-admin-status-red bg-admin-status-red-bg rounded-module border border-admin-status-red/20 shadow-sm">
          Failed to load message templates.
        </div>
      )}

      {!isLoading && !error && settings.length === 0 && (
        <div className="bg-white rounded-module border border-admin-line shadow-sm p-12 text-center">
          <MessageSquare className="w-8 h-8 text-admin-muted mx-auto mb-3" />
          <h3 className="text-card text-fg">No templates configured</h3>
        </div>
      )}

      {!isLoading && !error && settings.map(s => {
        const draft = draftFor(s);
        const unsaved = isUnsaved(s);
        const isSms = (CHANNELS_BY_KEY[s.key] || []).includes("SMS");
        const chars = draft.length;
        const isSmsOverlimit = isSms && chars > 160;
        const variables = VARIABLES_BY_KEY[s.key] || [];
        const channels = CHANNELS_BY_KEY[s.key] || [];
        const saveError = saveErrors[s.key];

        return (
          <div key={s.key} className="bg-white rounded-module border border-admin-line shadow-sm overflow-hidden flex flex-col">
            {/* Card Header */}
            <div className="p-5 border-b border-admin-line bg-white flex items-center justify-between">
              <div>
                <h3 className="text-card text-fg flex items-center gap-2">
                  {s.label}
                  {unsaved && <span className="w-2 h-2 rounded-full bg-admin-status-red" title="Unsaved changes"></span>}
                </h3>
                <p className="text-[13px] text-admin-muted mt-1 max-w-2xl">{s.hint}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {channels.map(ch => (
                  <span key={ch} className="px-2.5 py-1 rounded-control bg-admin-surface border border-admin-line text-eyebrow text-fg-subtle">
                    {ch}
                  </span>
                ))}
              </div>
            </div>

            {/* Body (Editor + Preview) */}
            <div className="p-5 flex flex-col xl:flex-row gap-6 bg-[#FAFAFA]">
              {/* Editor Side */}
              <div className="flex-1 flex flex-col">
                {variables.length > 0 && (
                  <div className="mb-3">
                    <span className="text-eyebrow text-fg-subtle tracking-wider block mb-2">Available Variables</span>
                    <div className="flex flex-wrap gap-2">
                      {variables.map(v => (
                        <button
                          key={v}
                          onClick={() => setDrafts(prev => ({ ...prev, [s.key]: draftFor(s) + v }))}
                          className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-admin-brand text-[12px] font-medium border border-blue-200 transition"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  value={draft}
                  onChange={e => setDrafts(prev => ({ ...prev, [s.key]: e.target.value }))}
                  className="w-full h-40 md:h-52 p-4 rounded-card border border-admin-line bg-white text-[14px] font-mono text-admin-ink shadow-sm outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand resize-none transition"
                  placeholder="Type message template here..."
                />

                {isSms && (
                  <div className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${isSmsOverlimit ? 'text-admin-status-red' : 'text-admin-muted'}`}>
                    {isSmsOverlimit && <AlertTriangle className="w-3.5 h-3.5" />}
                    <span>{chars} characters (SMS standard is 160)</span>
                  </div>
                )}
              </div>

              {/* Preview Side */}
              <div className="flex-1 flex flex-col">
                <span className="text-eyebrow text-fg-subtle tracking-wider block mb-2">Live Preview</span>
                <div className="flex-1 bg-white border border-admin-line rounded-card p-5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-admin-brand to-[#10b981]"></div>
                  <div className="text-[14px] text-admin-ink whitespace-pre-wrap leading-relaxed">
                    {renderPreview(draft) || <span className="text-admin-muted italic">Empty message...</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-5 border-t border-admin-line bg-white">
              {saveError && (
                <p className="text-[12px] text-admin-status-red font-medium mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {saveError}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setDrafts(prev => ({ ...prev, [s.key]: s.fallback }))}
                  disabled={draft === s.fallback}
                  iconLeft={<RotateCcw />}
                >
                  Reset to default
                </Button>
                <Button
                  onClick={() => handleSave(s)}
                  loading={savingKey === s.key}
                  disabled={!unsaved || !draft.trim()}
                  iconLeft={<Save />}
                >
                  {savingKey === s.key ? "Saving…" : unsaved ? "Save changes" : "Saved"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
