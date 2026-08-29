import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { fetchSettings, saveSetting, type AdminSetting } from "../../api/admin";

export function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSettings();
      setSettings(list);
      setValues(Object.fromEntries(list.map(s => [s.key, s.value])));
      setDirty(new Set());
    } catch (err: any) {
      setError(err?.message || "Couldn't load settings.");
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
    setSaved(false);
  }

  async function handleSaveAll() {
    if (saving || dirty.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const key of dirty) {
        await saveSetting(key, values[key] ?? "");
      }
      setDirty(new Set());
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {settings.map(spec => {
        const value = values[spec.key] ?? "";
        const isDirty = dirty.has(spec.key);
        return (
          <label key={spec.key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs font-medium text-white/60">{spec.label}</span>
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
            </div>
            {spec.type === "textarea" ? (
              <textarea
                value={value}
                onChange={e => setValue(spec.key, e.target.value)}
                placeholder={spec.fallback}
                rows={4}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand resize-y"
              />
            ) : (
              <input
                type={spec.type === "number" ? "number" : "text"}
                value={value}
                onChange={e => setValue(spec.key, e.target.value)}
                placeholder={spec.fallback}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand"
              />
            )}
            {spec.hint && <p className="text-[11px] text-white/35 pl-1 leading-relaxed">{spec.hint}</p>}
          </label>
        );
      })}

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-[#0A1A2F] border-t border-white/10">
        <button
          onClick={handleSaveAll}
          disabled={saving || dirty.size === 0}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-40"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {!saving && saved && dirty.size === 0 && <CheckCircle2 className="w-4 h-4" />}
          {saving ? "Saving…" : dirty.size > 0 ? `Save ${dirty.size} change${dirty.size > 1 ? "s" : ""}` : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
