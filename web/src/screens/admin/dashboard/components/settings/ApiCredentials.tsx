import React, { useState } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import type { EditableSetting } from "../../api";
import { useSettingsDraft } from "../../hooks/useSettingsDraft";
import { cx } from "../../../../../ui/cx";
import { Badge, ErrorState, LoadingState, Notice, SaveBar, Section, controlBase, focusRing } from "../ds";

const GROUPS: Array<{ title: string; description: string; keys: string[] }> = [
  { title: "Firetext", description: "Customer SMS.", keys: ["FIRETEXT_API_KEY", "FIRETEXT_SENDER_ID"] },
  { title: "GPSLive", description: "Fleet tracking and road-charge zone alerts.", keys: ["GPS_API", "TMV_GPSLIVE_WEBHOOK_TOKEN"] }
];
const API_KEYS = GROUPS.flatMap(group => group.keys);
const isApiSetting = (setting: EditableSetting) => API_KEYS.includes(setting.key);

/** Credential overrides. Blank means the server keeps its own configured value. */
export function ApiCredentials() {
  const draft = useSettingsDraft("settings-api", isApiSetting);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  if (draft.query.isLoading) return <LoadingState label="Loading API settings" rows={4} />;
  if (draft.query.error) return <ErrorState title="Couldn't load API settings" message={(draft.query.error as Error).message} onRetry={() => void draft.query.refetch()} />;
  const reveal = (key: string) => setRevealed(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  return (
    <div className="space-y-4">
      <Notice tone="warning">Saved credentials are used for every request from then on. A wrong key stops SMS or tracking until it's corrected. Leave a field blank to use the server's own value.</Notice>
      {GROUPS.map(group => (
        <Section key={group.title} title={group.title} description={group.description}>
          <div className="divide-y divide-admin-line">
            {group.keys.map(key => {
              const spec = draft.settings.find(item => item.key === key);
              if (!spec) return null;
              const value = draft.value(key);
              const secret = spec.type === "password";
              const id = `api-${key}`;
              return (
                <div key={key} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_380px] md:items-start md:px-5">
                  <div className="min-w-0">
                    <label htmlFor={id} className="text-[14px] font-medium text-admin-ink">{spec.label}</label>
                    {spec.hint && <p className="text-[12.5px] text-admin-ink-2">{spec.hint}</p>}
                    <div className="mt-1"><Badge tone={value.trim() ? "info" : "neutral"}>{value.trim() ? "Override set" : "Using server value"}</Badge>{key in draft.changes && <span className="ml-2 text-[12px] font-semibold text-admin-status-amber">Edited</span>}</div>
                  </div>
                  <div>
                    <div className="relative">
                      <input id={id} type={secret && !revealed.has(key) ? "password" : "text"} value={value} autoComplete="off" spellCheck={false}
                        onChange={event => draft.setValue(key, event.target.value)} placeholder="Blank: use the server's value"
                        className={cx(controlBase, "w-full pr-11 font-mono", draft.failedKeys[key] && "border-admin-status-red")} />
                      {secret && <button type="button" onClick={() => reveal(key)} aria-label={revealed.has(key) ? `Hide ${spec.label}` : `Show ${spec.label}`}
                        className={cx("absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-admin-muted hover:bg-admin-surface", focusRing)}>
                        {revealed.has(key) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                    </div>
                    {value.trim() && <button type="button" onClick={() => draft.setValue(key, "")} className={cx("mt-1 inline-flex items-center gap-1 rounded text-[12.5px] font-medium text-admin-ink-2 hover:text-admin-ink", focusRing)}><RotateCcw className="h-3 w-3" />Clear override</button>}
                    {draft.failedKeys[key] && <p className="mt-1 text-[12.5px] text-admin-status-red">Not saved: {draft.failedKeys[key]}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      <SaveBar state={draft.state} onSave={() => void draft.save()} onDiscard={draft.discard} saveLabel="Save credentials" />
    </div>
  );
}
