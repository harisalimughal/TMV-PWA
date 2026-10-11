import React, { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, Input } from "../../ui";
import { Choice } from "../ui/Choice";
import type { Job, DriverJobSummaryInput, DriverJobSummaryPaymentMethod } from "../../api/jobs";

const METHODS: DriverJobSummaryPaymentMethod[] = ["Cash", "Card", "Link", "Bank Transfer", "Invoice"];
const LONDON = "Europe/London";
const emptyAmounts = (): Record<DriverJobSummaryPaymentMethod, string> => ({ Cash: "", Card: "", Link: "", "Bank Transfer": "", Invoice: "" });
type Charge = NonNullable<DriverJobSummaryInput["chargeItems"]>[number];
type Draft = {
  startTime: string; endTime: string; helperName: string; helperHours: string;
  paymentMethods: DriverJobSummaryPaymentMethod[]; paymentAmounts: Record<DriverJobSummaryPaymentMethod, string>;
  noPaymentReceived: boolean; chargeItems: Charge[];
};
const key = (job: Job) => `tmv:manual-details:v2:${job.driverInitials}:${job.jobId}`;
export function clearManualDetailsDraft(job: Job): void { try { localStorage.removeItem(key(job)); } catch {} }

function localTime(iso: string): string {
  const time = DateTime.fromISO(iso).setZone(LONDON);
  return time.isValid ? time.toFormat("yyyy-LL-dd'T'HH:mm") : "";
}

function isoTime(value: string, original: string): string {
  if (value === localTime(original)) return DateTime.fromISO(original).toUTC().toISO() || "";
  const time = DateTime.fromISO(value, { zone: LONDON });
  return time.isValid && time.toFormat("yyyy-LL-dd'T'HH:mm") === value ? time.toUTC().toISO()! : "";
}

function initial(job: Job): Draft {
  const paymentAmounts = emptyAmounts();
  const paymentMethods: DriverJobSummaryPaymentMethod[] = [];
  for (const method of METHODS) {
    const rows = job.paymentBreakdown?.filter(row => row.method === method) ?? [];
    if (!rows.length) continue;
    paymentMethods.push(method);
    paymentAmounts[method] = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0).toString();
    paymentAmounts[method] = (Number(paymentAmounts[method]) / 100).toFixed(2);
  }
  if (!paymentMethods.length && job.paymentMethod) {
    for (const method of METHODS) if (job.paymentMethod.split(",").map(value => value.trim()).includes(method)) paymentMethods.push(method);
  }
  if (paymentMethods.includes("Invoice") && Number(paymentAmounts.Invoice) === 0) {
    const recorded = METHODS.filter(method => method !== "Invoice").reduce((sum, method) => sum + (Number(paymentAmounts[method]) || 0), 0);
    paymentAmounts.Invoice = Math.max(0, (job.amountCharged ?? job.totalCharges) - recorded).toFixed(2);
  }
  const chargeItems: Charge[] = [];
  if (job.extraCharges.includes("London Congestion charge")) chargeItems.push({ type: "congestion", amount: job.chargeSnapshot ? (job.chargeSnapshot.congestionPence / 100).toFixed(2) : "" });
  if (job.extraCharges.includes("Tunnel Charges")) chargeItems.push({ type: "tunnel", amount: job.chargeSnapshot ? (job.chargeSnapshot.tunnelPence / 100).toFixed(2) : "" });
  return { startTime: localTime(job.bookedStart), endTime: localTime(job.actualFinish),
    helperName: "", helperHours: "", paymentMethods, paymentAmounts, noPaymentReceived: false, chargeItems };
}

function restored(job: Job): Draft {
  const fallback = initial(job);
  try {
    const saved = JSON.parse(localStorage.getItem(key(job)) || "null");
    const d = saved?.draft;
    if (saved?.version === 2 && d &&
        [d.startTime, d.endTime, d.helperName, d.helperHours].every(value => typeof value === "string") &&
        typeof d.noPaymentReceived === "boolean" && Array.isArray(d.paymentMethods) && d.paymentMethods.every((method: string) => METHODS.includes(method as DriverJobSummaryPaymentMethod)) &&
        d.paymentAmounts && METHODS.every(method => typeof d.paymentAmounts[method] === "string") &&
        Array.isArray(d.chargeItems) && d.chargeItems.length <= 30 && d.chargeItems.every((row: Charge) => row && ["congestion", "tunnel"].includes(row.type) && typeof row.amount === "string")) return d;
  } catch {}
  return fallback;
}

const validMoney = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 1_000_000;

export function DriverJobSummaryForm({ job, submitting, onSubmit }: {
  job: Job; submitting: boolean; onSubmit: (input: DriverJobSummaryInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => restored(job));
  const [storageError, setStorageError] = useState(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    try { localStorage.setItem(key(job), JSON.stringify({ version: 2, savedAt: Date.now(), draft })); setStorageError(false); }
    catch { setStorageError(true); }
  }, [draft, job.jobId, job.driverInitials]);
  const update = (changes: Partial<Draft>) => setDraft(current => ({ ...current, ...changes }));
  const startTime = isoTime(draft.startTime, job.bookedStart);
  const endTime = isoTime(draft.endTime, job.actualFinish);
  const duration = (Date.parse(endTime) - Date.parse(startTime)) / 3_600_000;
  const blocked = (() => {
    if (!startTime || !endTime) return "Enter valid start and end times (London).";
    if (duration < 0 || duration > 168) return "Job times must be ordered and span at most seven days.";
    if (draft.chargeItems.length > 30) return "Report at most 30 charge items.";
    if (draft.helperName.length > 160) return "Helper name is too long.";
    if (draft.helperHours && (!validMoney(draft.helperHours) || Number(draft.helperHours) > 168)) return "Enter valid helper hours (0-168).";
    if (Number(draft.helperHours) > 0 && !draft.helperName.trim()) return "Add the helper name or leave helper hours blank.";
    if (!draft.noPaymentReceived && !draft.paymentMethods.length) return "Choose a payment method or No payment received.";
    for (const method of draft.paymentMethods) if (!validMoney(draft.paymentAmounts[method])) return `Enter a valid ${method} amount.`;
    if (draft.paymentMethods.filter(method => method !== "Invoice").reduce((sum, method) => sum + Number(draft.paymentAmounts[method]), 0) > 1_000_000) return "Total collections exceed the supported limit.";
    for (const row of draft.chargeItems) {
      if (row.amount.trim() && !validMoney(row.amount)) return "Enter a valid charge amount or leave it blank.";
      if ((row.name?.length || 0) > 160 || (row.reference?.length || 0) > 160) return "Charge name or reference is too long.";
    }
    return undefined;
  })();
  const collected = draft.paymentMethods.filter(method => method !== "Invoice").reduce((sum, method) => sum + Math.round((Number(draft.paymentAmounts[method]) || 0) * 100), 0);
  const setCharge = (index: number, changes: Partial<Charge>) => update({ chargeItems: draft.chargeItems.map((row, i) => i === index ? { ...row, ...changes } : row) });
  return <form className="flex flex-col gap-5" onSubmit={async event => {
    event.preventDefault();
    if (blocked || submitting || submittingRef.current) return;
    submittingRef.current = true;
    try { await onSubmit({ schemaVersion: 2, ...draft, startTime, endTime }); }
    finally { submittingRef.current = false; }
  }}>
    <header><h1 className="text-title text-fg">Manual details</h1><p className="mt-1 font-mono text-helper text-fg-muted">{job.jobId}</p></header>
    {storageError && <Alert tone="warning">Draft storage is unavailable on this device.</Alert>}
    <fieldset disabled={submitting} className="min-w-0 border-b border-line pb-5">
      <legend className="mb-3 text-heading text-fg">Time (London)</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label="Start time" required>{control => <Input {...control} type="datetime-local" value={draft.startTime} onChange={event => update({ startTime: event.target.value })} />}</Field>
        <Field label="End time" required>{control => <Input {...control} type="datetime-local" value={draft.endTime} onChange={event => update({ endTime: event.target.value })} />}</Field>
      </div>
    </fieldset>
    <fieldset disabled={submitting} className="min-w-0 border-b border-line pb-5">
      <legend className="mb-3 text-heading text-fg">Helper (optional)</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Helper name">{control => <Input {...control} maxLength={160} value={draft.helperName} onChange={event => update({ helperName: event.target.value })} />}</Field>
        <Field label="Hours on this job">{control => <Input {...control} inputMode="decimal" value={draft.helperHours} onChange={event => update({ helperHours: event.target.value })} />}</Field>
      </div>
    </fieldset>
    <fieldset disabled={submitting} className="min-w-0 border-b border-line pb-5">
      <legend className="mb-3 text-heading text-fg">Charges collected (included in payments)</legend>
      <Choice type="checkbox" label="Congestion charge" selected={draft.chargeItems.some(row => row.type === "congestion")} onToggle={() => update({ chargeItems: draft.chargeItems.some(row => row.type === "congestion") ? draft.chargeItems.filter(row => row.type !== "congestion") : [{ type: "congestion", amount: "" }, ...draft.chargeItems] })} />
      <div className="mt-3 flex flex-col gap-3">
        {draft.chargeItems.map((row, index) => <div key={`${row.type}-${index}`} className="min-w-0 rounded-lg border border-line p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><span className="text-label text-fg">{row.type === "congestion" ? "Congestion" : "Tunnel crossing"}</span>
            <button type="button" title="Remove charge" aria-label={`Remove charge ${index + 1}`} onClick={() => update({ chargeItems: draft.chargeItems.filter((_, i) => i !== index) })} className="p-2 text-fg-muted"><Trash2 size={18} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount collected (optional)">{control => <Input {...control} prefix="GBP" inputMode="decimal" value={row.amount} onChange={event => setCharge(index, { amount: event.target.value })} />}</Field>
            {row.type === "tunnel" && <Field label="Tunnel name (optional)">{control => <Input {...control} maxLength={160} value={row.name || ""} onChange={event => setCharge(index, { name: event.target.value })} />}</Field>}
            <Field label="Crossing / zone reference (optional)">{control => <Input {...control} maxLength={160} value={row.reference || ""} onChange={event => setCharge(index, { reference: event.target.value })} />}</Field>
          </div>
        </div>)}
        <Button variant="secondary" type="button" disabled={draft.chargeItems.length >= 30} iconLeft={<Plus size={18} />} onClick={() => update({ chargeItems: [...draft.chargeItems, { type: "tunnel", amount: "" }] })}>Add tunnel crossing</Button>
      </div>
    </fieldset>
    <fieldset disabled={submitting} className="min-w-0">
      <legend className="mb-3 text-heading text-fg">Payment details</legend>
      <div className="flex flex-col gap-3">
        <Choice type="checkbox" label="No payment received" selected={draft.noPaymentReceived} onToggle={() => update({ noPaymentReceived: !draft.noPaymentReceived, paymentMethods: [] })} />
        {METHODS.map(method => <div key={method} className="min-w-0">
          <Choice type="checkbox" label={method} selected={draft.paymentMethods.includes(method)} onToggle={() => update({ noPaymentReceived: false, paymentMethods: draft.paymentMethods.includes(method) ? draft.paymentMethods.filter(value => value !== method) : [...draft.paymentMethods, method] })} />
          {draft.paymentMethods.includes(method) && <div className="mt-2 pl-4">
            <Field label={method === "Invoice" ? "Invoice amount (uncollected)" : `${method} amount collected`} required>{control => <Input {...control} prefix="GBP" inputMode="decimal" value={draft.paymentAmounts[method]} onChange={event => update({ paymentAmounts: { ...draft.paymentAmounts, [method]: event.target.value } })} />}</Field>
          </div>}
        </div>)}
      </div>
      <p className="mt-4 text-heading tabular-nums text-fg">Total collected: GBP {(collected / 100).toFixed(2)}</p>
    </fieldset>
    {blocked && <Alert tone="warning">{blocked}</Alert>}
    <Button type="submit" fullWidth size="lg" loading={submitting} blockedReason={blocked} onBlocked={() => undefined} className="[&>span>span]:whitespace-normal [&>span>span]:overflow-visible">Submit Manual details &amp; next</Button>
  </form>;
}
