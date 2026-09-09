import React, { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, RotateCcw, Save } from "lucide-react";
import { fetchSettings, saveSetting, type EditableSetting } from "../api";
import { Button } from "../../../../ui";

/**
 * Lets an admin rotate the Firetext (customer SMS) and GPSLive (fleet tracking,
 * congestion/tunnel zone alerts) credentials without SSH access to the VPS or a
 * redeploy. Saves through the same /api/admin/settings (Mongo) plumbing every other
 * admin-editable value already uses -- see admin/settings-spec.ts for the four keys
 * and backend/src/config/live-settings.ts for where each one is actually read at
 * request time. A blank field means "no override" -- the server keeps using whatever
 * is in its own .env.production, exactly as before this page existed.
 */
const API_SETTING_KEYS = ["FIRETEXT_API_KEY", "FIRETEXT_SENDER_ID", "GPS_API", "TMV_GPSLIVE_WEBHOOK_TOKEN"];

export function ApiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<EditableSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { settings: list } = await fetchSettings();
      const apiSettings = list.filter(s => API_SETTING_KEYS.includes(s.key));
      setSettings(apiSettings);
      setValues(Object.fromEntries(apiSettings.map(s => [s.key, s.value])));
      setDirty(new Set());
    } catch (err: any) {
      setError(err?.message || "Couldn't load API settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setValue(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set(prev).add(key));
  }

  function toggleReveal(key: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSaveAll() {
    if (saving || dirty.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const key of dirty) await saveSetting(key, values[key] ?? "");
      setDirty(new Set());
    } catch (err: any) {
      setError(err?.message || "Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setValues(Object.fromEntries(settings.map(s => [s.key, s.value])));
    setDirty(new Set());
  }

  function byKey(key: string): EditableSetting | undefined {
    return settings.find(s => s.key === key);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-admin-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[900px] mx-auto pb-24">
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm flex items-start justify-between">
        <div>
          <h2 className="text-title text-fg mb-1">API</h2>
          <p className="text-[14px] text-admin-muted max-w-3xl">
            Firetext and GPSLive credentials. Saving here takes effect immediately for every request from now
            on — no redeploy or server access needed. Leave a field blank to keep using the value already
            configured on the server.
          </p>
        </div>
        {dirty.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-admin-status-amber-bg text-amber-700 rounded-card border border-amber-200 text-[13px] font-semibold shrink-0">
            <AlertTriangle className="w-4 h-4" /> Unsaved changes
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[13px] text-admin-status-red bg-admin-status-red-bg border border-[#FECACA] rounded-card px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <SettingsCard icon={<KeyRound className="w-4 h-4 text-admin-brand" />} title="Firetext — customer SMS">
        <div className="space-y-5">
          <ApiField
            spec={byKey("FIRETEXT_API_KEY")}
            value={values.FIRETEXT_API_KEY ?? ""}
            onChange={v => setValue("FIRETEXT_API_KEY", v)}
            revealed={revealed.has("FIRETEXT_API_KEY")}
            onToggleReveal={() => toggleReveal("FIRETEXT_API_KEY")}
          />
          <ApiField
            spec={byKey("FIRETEXT_SENDER_ID")}
            value={values.FIRETEXT_SENDER_ID ?? ""}
            onChange={v => setValue("FIRETEXT_SENDER_ID", v)}
          />
        </div>
      </SettingsCard>

      <SettingsCard icon={<KeyRound className="w-4 h-4 text-admin-brand" />} title="GPSLive — fleet tracking & zone alerts">
        <div className="space-y-5">
          <ApiField
            spec={byKey("GPS_API")}
            value={values.GPS_API ?? ""}
            onChange={v => setValue("GPS_API", v)}
            revealed={revealed.has("GPS_API")}
            onToggleReveal={() => toggleReveal("GPS_API")}
          />
          <ApiField
            spec={byKey("TMV_GPSLIVE_WEBHOOK_TOKEN")}
            value={values.TMV_GPSLIVE_WEBHOOK_TOKEN ?? ""}
            onChange={v => setValue("TMV_GPSLIVE_WEBHOOK_TOKEN", v)}
            revealed={revealed.has("TMV_GPSLIVE_WEBHOOK_TOKEN")}
            onToggleReveal={() => toggleReveal("TMV_GPSLIVE_WEBHOOK_TOKEN")}
          />
        </div>
      </SettingsCard>

      {dirty.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-5 rounded-pill border border-line bg-surface px-5 py-2.5 shadow-md">
            <span className="flex items-center gap-2 text-label font-semibold text-fg">
              <AlertTriangle className="size-4 text-warning-signal" />
              {dirty.size} unsaved change{dirty.size > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleDiscard} disabled={saving}>
                Discard
              </Button>
              <Button onClick={handleSaveAll} loading={saving} iconLeft={<Save />}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-module border border-admin-line shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 border-b border-admin-line flex items-center justify-between bg-[#FAFAFA]">
        <h3 className="text-card text-fg flex items-center gap-2">
          {icon} {title}
        </h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function ApiField({
  spec,
  value,
  onChange,
  revealed,
  onToggleReveal
}: {
  spec: EditableSetting | undefined;
  value: string;
  onChange: (value: string) => void;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  if (!spec) return null;
  const isPassword = spec.type === "password";
  const overridden = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-card border border-admin-line bg-admin-surface/50">
      <div className="flex items-center justify-between gap-3">
        <label className="text-eyebrow text-fg-subtle tracking-wider">{spec.label}</label>
        <span
          className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            overridden
              ? "bg-admin-status-green-bg text-admin-status-green"
              : "bg-white text-admin-muted border border-admin-line"
          }`}
        >
          {overridden ? "Overridden" : "Using server value"}
        </span>
      </div>
      <div className="relative">
        <input
          type={isPassword && !revealed ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Leave blank to use the server's own value"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-10 pl-3 pr-10 rounded-control border border-admin-line bg-white text-[14px] font-mono text-admin-ink outline-none focus:border-admin-brand transition"
        />
        {isPassword && (
          <button
            type="button"
            onClick={onToggleReveal}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-admin-surface text-admin-muted transition"
            title={revealed ? "Hide" : "Show"}
            aria-label={revealed ? "Hide value" : "Show value"}
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {spec.hint && <p className="text-[12px] text-admin-muted">{spec.hint}</p>}
      {overridden && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="self-start flex items-center gap-1 text-[12px] font-medium text-admin-muted hover:text-admin-ink transition"
        >
          <RotateCcw className="w-3 h-3" /> Clear override, use server value
        </button>
      )}
    </div>
  );
}
