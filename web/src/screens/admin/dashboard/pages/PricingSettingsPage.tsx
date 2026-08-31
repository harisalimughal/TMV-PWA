import React, { useEffect, useState } from "react";
import { AlertTriangle, Box, Clock, Loader2, Save, Users } from "lucide-react";
import { fetchSettings, saveSetting, type EditableSetting } from "../api";
import { Button } from "../../../../ui";

/**
 * Rebuilt, not ported: the source's PricingSettingsPage.tsx and SettingsPage.tsx were
 * both non-functional UI mockups -- every rate field was local-only state, and
 * handleSaveAll()'s only comment was "In a real app, API call goes here". Nothing was
 * ever actually persisted. This keeps the same card layout and sticky "unsaved
 * changes" save bar, but saves for real through tmv-pwa's own /api/admin/settings
 * (Mongo) -- see backend/src/admin/settings-spec.ts for the exact key list. Used for
 * both the "Pricing Settings" and "Settings" nav entries (the source's two separate
 * pages covered the same ground -- rates here, Sheets-schema/caching trivia there that
 * doesn't apply to a Sheets-free backend).
 */
export function PricingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<EditableSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { settings: list } = await fetchSettings();
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

  const crewKeys = ["CREW_RATE_1_MAN", "CREW_RATE_2_MAN", "CREW_RATE_3_MAN"];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-24">
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm flex items-start justify-between">
        <div>
          <h2 className="text-title text-fg mb-1">Pricing Settings</h2>
          <p className="text-[14px] text-admin-muted max-w-3xl">
            Configure crew rates, packing service pricing, and overtime rules. Changes apply to all new jobs
            immediately — no developer or redeployment required.
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

      <div className="space-y-6">
        <SettingsCard icon={<Users className="w-4 h-4 text-admin-brand" />} title="Base Crew Rates">
          <div className="space-y-5">
            {crewKeys.map(key => {
              const spec = byKey(key);
              if (!spec) return null;
              return (
                <div key={key} className="flex flex-wrap md:flex-nowrap items-end gap-4 p-4 rounded-card border border-admin-line bg-admin-surface/50">
                  <div className="w-full md:w-1/3">
                    <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">{spec.label}</label>
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Rate (£)</label>
                    <MoneyInput value={values[key] ?? ""} placeholder={spec.fallback} onChange={v => setValue(key, v)} />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-center py-3 px-1">
              <span className="text-[13px] font-medium text-admin-ink-2">Billing Unit</span>
              <input
                type="text"
                value={values.CREW_BILLING_UNIT ?? ""}
                onChange={e => setValue("CREW_BILLING_UNIT", e.target.value)}
                placeholder={byKey("CREW_BILLING_UNIT")?.fallback}
                className="w-48 h-9 px-3 rounded-card border border-admin-line bg-white text-[13px] text-admin-ink outline-none focus:border-admin-brand transition text-right"
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard icon={<Box className="w-4 h-4 text-admin-brand" />} title="Full / Packing Service">
          <div className="flex flex-wrap md:flex-nowrap items-start gap-4 p-4 rounded-card border border-admin-brand/20 bg-admin-brand-soft/40">
            <div className="w-full md:w-1/3">
              <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Service Rate (£)</label>
              <MoneyInput value={values.PACKING_RATE ?? ""} placeholder={byKey("PACKING_RATE")?.fallback} onChange={v => setValue("PACKING_RATE", v)} />
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Billing Unit</label>
              <input
                type="text"
                value={values.PACKING_BILLING_UNIT ?? ""}
                onChange={e => setValue("PACKING_BILLING_UNIT", e.target.value)}
                placeholder={byKey("PACKING_BILLING_UNIT")?.fallback}
                className="w-full h-10 px-3 rounded-card border border-admin-line bg-white text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard icon={<Clock className="w-4 h-4 text-admin-brand" />} title="Overtime Rules">
          <div className="flex flex-wrap md:flex-nowrap items-start gap-6">
            <div className="w-full md:w-1/2">
              <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Overtime Rate per 30 min (£)</label>
              <MoneyInput
                value={values.OVERTIME_RATE_PER_30 ?? ""}
                placeholder="blank = use the crew/packing rate above"
                onChange={v => setValue("OVERTIME_RATE_PER_30", v)}
              />
              <p className="text-[11px] text-admin-muted mt-1.5">Leave blank to use the relevant crew/packing rate instead of a flat rate.</p>
            </div>
            <div className="w-full md:w-1/2">
              <label className="block text-eyebrow text-fg-subtle tracking-wider mb-1.5">Grace Period (minutes)</label>
              <input
                type="number"
                min={0}
                value={values.OVERTIME_GRACE_MINS ?? ""}
                onChange={e => setValue("OVERTIME_GRACE_MINS", e.target.value)}
                placeholder={byKey("OVERTIME_GRACE_MINS")?.fallback}
                className="w-full h-10 px-3 rounded-card border border-admin-line bg-white text-[14px] font-mono text-admin-ink outline-none focus:border-admin-brand transition"
              />
              <p className="text-[11px] text-admin-muted mt-1.5">Allow N minutes over booked time before charges apply.</p>
            </div>
          </div>
        </SettingsCard>
      </div>

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
                {saving ? "Saving…" : "Save configuration"}
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
        <h3 className="text-card text-fg flex items-center gap-2">{icon} {title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function MoneyInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted font-semibold">£</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-8 pr-3 rounded-card border border-admin-line bg-white text-[14px] font-mono text-admin-ink outline-none focus:border-admin-brand transition"
      />
    </div>
  );
}
