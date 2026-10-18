import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { EditableSetting } from "../../api";
import { useSettingsDraft } from "../../hooks/useSettingsDraft";
import { Action, ErrorState, LoadingState, Notice, SaveBar, Section, controlBase } from "../ds";
import { cx } from "../../../../../ui/cx";

const FIXED_KEYS = ["CREW_BILLING_UNIT", "PACKING_RATE", "CONGESTION_CHARGE", "TUNNEL_CHARGE", "OVERTIME_RATE_PER_30", "OVERTIME_GRACE_MINS"];

export function crewRateKey(crewSize: number) { return `CREW_RATE_${crewSize}_MAN`; }
export function crewSizeFromKey(key: string) { return Number(/^CREW_RATE_([1-9]\d*)_MAN$/.exec(key)?.[1] ?? 0); }
const isPricingSetting = (setting: EditableSetting) => crewSizeFromKey(setting.key) > 0 || FIXED_KEYS.includes(setting.key);

/** Blank is allowed where the field has a fallback or inherits; otherwise a non-negative number. */
export function validatePrice(raw: string, { allowBlank }: { allowBlank: boolean }): string | null {
  const value = raw.trim();
  if (!value) return allowBlank ? null : "Enter an amount";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Enter a number";
  if (number < 0) return "Can't be negative";
  return null;
}

/**
 * Pricing rates (audit p.21): compact groups, every field states its unit, blanks
 * show what is used instead, and saving reports each key's real outcome. Nothing here
 * recalculates existing jobs in the dashboard; see the open question in the handoff.
 */
export function PricingSettings() {
  const draft = useSettingsDraft("settings-pricing", isPricingSetting);
  const [newSize, setNewSize] = useState("");
  const [newRate, setNewRate] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  if (draft.query.isLoading) return <LoadingState label="Loading pricing" rows={6} />;
  if (draft.query.error) return <ErrorState title="Couldn't load pricing" message={(draft.query.error as Error).message} onRetry={() => void draft.query.refetch()} />;

  const byKey = (key: string) => draft.settings.find(item => item.key === key);
  const crew = draft.settings.filter(item => crewSizeFromKey(item.key) > 0).sort((a, b) => crewSizeFromKey(a.key) - crewSizeFromKey(b.key));
  const unit = draft.value("CREW_BILLING_UNIT").trim() || byKey("CREW_BILLING_UNIT")?.fallback || "";
  const errors: Record<string, string | null> = {};
  for (const item of draft.settings) {
    if (item.key === "CREW_BILLING_UNIT") continue;
    errors[item.key] = validatePrice(draft.value(item.key), { allowBlank: item.key === "OVERTIME_RATE_PER_30" || Boolean(item.fallback) });
  }
  const invalid = Object.keys(draft.changes).filter(key => errors[key]);

  const addCrew = () => {
    const size = Number(newSize);
    if (!Number.isInteger(size) || size < 4 || size > 12) { setAddError("Crew size must be a whole number from 4 to 12."); return; }
    if (byKey(crewRateKey(size))) { setAddError(`A ${size}-person rate already exists.`); return; }
    const rateError = validatePrice(newRate, { allowBlank: false });
    if (rateError) { setAddError(`Rate: ${rateError.toLowerCase()}.`); return; }
    setAddError(null);
    draft.addSetting({ key: crewRateKey(size), label: `${size}-person crew`, type: "number", fallback: "", value: "" }, newRate.trim());
    setNewSize(""); setNewRate("");
  };

  const field = (key: string, props: { unit: string; hint?: React.ReactNode; blankMeans?: string }) => {
    const spec = byKey(key);
    if (!spec) return null;
    return <PriceField key={key} id={`pricing-${key}`} label={spec.label} value={draft.value(key)} onChange={value => draft.setValue(key, value)}
      unit={props.unit} placeholder={spec.fallback ? `Default ${spec.fallback}` : props.blankMeans} hint={props.hint ?? spec.hint}
      changed={key in draft.changes} error={key in draft.changes ? errors[key] : null} failed={draft.failedKeys[key]} />;
  };

  return (
    <div className="space-y-4">
      <Notice tone="info">Changes take effect for new price calculations after you save. Saving does not send anything to customers or drivers.</Notice>

      <Section title="Crew rates" description="Normal service, charged by crew size." id="pricing-crew">
        <div className="divide-y divide-admin-line">
          {crew.map(item => field(item.key, { unit: unit ? `£ per ${unit}` : "£", hint: item.hint }))}
          <div className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end md:px-5">
            <p className="text-[14px] font-medium text-admin-ink-2 md:self-center">Add a crew size</p>
            <label className="text-[13px] font-medium text-admin-ink-2">People (4–12)
              <input type="number" inputMode="numeric" min={4} max={12} value={newSize} onChange={event => setNewSize(event.target.value)} className={cx(controlBase, "mt-1 w-full font-mono")} />
            </label>
            <label className="text-[13px] font-medium text-admin-ink-2">Rate (£)
              <input type="number" inputMode="decimal" min={0} step="0.01" value={newRate} onChange={event => setNewRate(event.target.value)} className={cx(controlBase, "mt-1 w-full font-mono")} />
            </label>
            <Action icon={<Plus />} onClick={addCrew}>Add rate</Action>
            {addError && <p role="alert" className="text-[13px] text-admin-status-red md:col-span-4">{addError}</p>}
          </div>
          {byKey("CREW_BILLING_UNIT") && (
            <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_320px] md:items-center md:px-5">
              <div>
                <label htmlFor="pricing-CREW_BILLING_UNIT" className="text-[14px] font-medium text-admin-ink">Billing unit label</label>
                <p className="text-[12.5px] text-admin-ink-2">Text describing what a crew rate is charged per. This page can't confirm whether price calculations read it.</p>
              </div>
              <input id="pricing-CREW_BILLING_UNIT" value={draft.value("CREW_BILLING_UNIT")} onChange={event => draft.setValue("CREW_BILLING_UNIT", event.target.value)}
                placeholder={byKey("CREW_BILLING_UNIT")?.fallback} className={cx(controlBase, "w-full")} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Packing" description="Applied when the booking mentions packing or full packing." id="pricing-packing">
        {field("PACKING_RATE", { unit: "£ per 30 min" })}
      </Section>

      <Section title="Additional charges" description="Fixed amounts added when the driver records the charge on a job." id="pricing-extras">
        <div className="divide-y divide-admin-line">
          {field("CONGESTION_CHARGE", { unit: "£ per charge", hint: "Added when the driver selects the London Congestion Charge." })}
          {field("TUNNEL_CHARGE", { unit: "£ per charge", hint: "Added when the driver selects tunnel charges." })}
        </div>
      </Section>

      <Section title="Overtime" description="Time worked beyond the booked allowance." id="pricing-overtime">
        <div className="divide-y divide-admin-line">
          {field("OVERTIME_RATE_PER_30", {
            unit: "£ per 30 min", blankMeans: "Uses crew or packing rate",
            hint: draft.value("OVERTIME_RATE_PER_30").trim() ? "A flat overtime rate for every job." : "Blank: overtime is charged at the job's own crew or packing rate."
          })}
          {field("OVERTIME_GRACE_MINS", { unit: "minutes", hint: "Minutes allowed past the booked time before overtime starts." })}
        </div>
      </Section>

      {invalid.length > 0 && <Notice tone="warning">Fix {invalid.length === 1 ? "the highlighted field" : `${invalid.length} highlighted fields`} before saving.</Notice>}
      <SaveBar state={draft.state} onSave={() => { if (!invalid.length) void draft.save(); }} onDiscard={draft.discard} saveLabel="Save pricing" />
    </div>
  );
}

function PriceField({ id, label, value, onChange, unit, placeholder, hint, changed, error, failed }: {
  id: string; label: string; value: string; onChange: (value: string) => void; unit: string; placeholder?: string;
  hint?: React.ReactNode; changed: boolean; error?: string | null; failed?: string;
}) {
  const describedBy = [hint && `${id}-hint`, (error || failed) && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_320px] md:items-center md:px-5">
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 text-[14px] font-medium text-admin-ink">{label}{changed && <span className="rounded bg-admin-status-amber-bg px-1.5 text-[12px] font-semibold text-admin-ink">Edited</span>}</label>
        {hint && <p id={`${id}-hint`} className="text-[12.5px] text-admin-ink-2">{hint}</p>}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}
            aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy}
            className={cx(controlBase, "w-full min-w-0 text-right font-mono", (error || failed) && "border-admin-status-red")} />
          <span className="w-[112px] shrink-0 text-[13px] text-admin-ink-2">{unit}</span>
        </div>
        {(error || failed) && <p id={`${id}-error`} className="mt-1 text-[12.5px] text-admin-status-red">{error || `Not saved: ${failed}`}</p>}
      </div>
    </div>
  );
}
