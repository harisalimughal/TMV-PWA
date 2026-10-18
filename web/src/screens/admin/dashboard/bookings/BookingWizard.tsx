/**
 * Internal booking creation wizard. It saves an enquiry (never a confirmed booking): confirming is a separate,
 * explicit step in the inbox. No price is calculated here, because no pricing engine is connected; staff may record
 * a manual price, which needs a reason. The draft autosaves to this browser (not to the server) and a save is
 * idempotent, so a double click or a retry cannot create two enquiries.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { EMPTY_DRAFT, STEPS, newIdempotencyKey, scheduleWindow, validateStep, type BookingDraft, type Enquiry, type StepId } from "../../../../lib/booking";
import { BookingWriteError } from "../../../../lib/booking/client";
import { useBookingWrite } from "./hooks";
import { Button, Card, StatusPill } from "./ui";
import { formatCalendarDate, formatMoney } from "../utils/format";
import { navigateTo, sectionHref } from "../navigation";

const DRAFT_KEY = "tmv:booking-draft";
const STEP_LABEL: Record<StepId, string> = { customer: "Customer and locations", requirements: "Requirements", schedule: "Scheduling", quote: "Quotation", review: "Review and save" };
const VANS = ["Small van", "Medium van", "Large van", "Luton van"];
const PROPERTIES = ["Studio", "1 bed flat", "2 bed flat", "3 bed house", "4+ bed house", "Office", "Other"];
const STAIRS = ["Ground floor or lift", "1 flight", "2 flights", "3 or more flights"];

interface Saved { draft: BookingDraft; step: StepId; key: string; price: string; reason: string; savedAt: string }
const fresh = (): Saved => ({ draft: EMPTY_DRAFT, step: "customer", key: newIdempotencyKey("create-enquiry"), price: "", reason: "", savedAt: "" });
function load(): Saved {
  try { const raw = sessionStorage.getItem(DRAFT_KEY); if (raw) { const parsed = JSON.parse(raw) as Saved; if (parsed?.draft && STEPS.includes(parsed.step)) return { ...fresh(), ...parsed, draft: { ...EMPTY_DRAFT, ...parsed.draft } }; } } catch { /* unreadable draft: start clean */ }
  return fresh();
}

const input = "mt-1 block min-h-10 w-full rounded-xl border bg-[var(--bos-surface)] px-3 text-[14px] text-[var(--bos-ink)]";
function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: (props: { id: string; className: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-[var(--bos-ink)]">{label}</label>
      {children({ id, className: `${input} ${error ? "border-[var(--bos-coral)]" : "border-[var(--bos-line-strong)]"}`, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {error ? <p id={`${id}-error`} className="mt-1 text-[12px] text-[var(--bos-coral-fg)]">{error}</p> : hint ? <p id={`${id}-hint`} className="mt-1 text-[12px] text-[var(--bos-ink-3)]">{hint}</p> : null}
    </div>
  );
}

export function BookingWizard({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Enquiry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { draft, step } = saved;
  const set = (patch: Partial<BookingDraft>) => { setSaved(s => ({ ...s, draft: { ...s.draft, ...patch } })); };

  useEffect(() => { // autosave while editing; cleared on a successful save
    if (created) return;
    const handle = setTimeout(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...saved, savedAt: new Date().toISOString() })); } catch { /* draft lives in memory only */ } }, 400);
    return () => clearTimeout(handle);
  }, [saved, created]);
  useEffect(() => { headingRef.current?.focus(); }, [step, created]);

  const createEnquiry = useBookingWrite((api, v: { draft: BookingDraft; key: string }) => api.createEnquiry(v.draft, v.key));
  const addQuote = useBookingWrite((api, v: { id: string; pence: number; reason: string; version: number }) => api.addManualQuote(v.id, v.pence, v.reason, v.version));
  const saving = createEnquiry.isPending || addQuote.isPending;

  const priceEntered = saved.price.trim() !== "";
  const pence = Math.round(Number(saved.price) * 100);
  const priceErrors: Record<string, string> = {};
  if (priceEntered && !(Number.isFinite(Number(saved.price)) && Number(saved.price) > 0)) priceErrors.price = "Enter a price above zero, or leave it empty to save without a price.";
  if (priceEntered && saved.reason.trim().length < 5) priceErrors.reason = "A reason is required when you enter a price yourself.";
  const errorsFor = (s: StepId): Record<string, string> => (s === "quote" ? priceErrors : s === "review" ? {} : (validateStep(s, draft) as Record<string, string>));
  const firstInvalid = STEPS.find(s => Object.keys(errorsFor(s)).length > 0);

  const go = (target: StepId) => { setShown({}); setSaved(s => ({ ...s, step: target })); };
  const next = () => {
    const errors = errorsFor(step);
    if (Object.keys(errors).length) { setShown(errors); return; }
    go(STEPS[STEPS.indexOf(step) + 1]);
  };

  async function save() {
    if (firstInvalid) { go(firstInvalid); setShown(errorsFor(firstInvalid)); return; }
    setProblem(null);
    try {
      // Reuse an enquiry already created by an earlier attempt of this save, so a retry never duplicates it.
      let enquiry = created ?? await createEnquiry.mutateAsync({ draft, key: saved.key });
      setCreated(enquiry);
      if (priceEntered) enquiry = await addQuote.mutateAsync({ id: enquiry.id, pence, reason: saved.reason.trim(), version: enquiry.version });
      setCreated(enquiry);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
    } catch (error) {
      setProblem(error instanceof BookingWriteError ? error.detail.message : "That did not go through. Nothing was lost; try again.");
    }
  }

  const window_ = useMemo(() => scheduleWindow(draft), [draft]);
  const summary: Array<[string, string | null]> = [
    ["Customer", draft.customerName.trim() || null], ["Contact", draft.phone.trim() || draft.email.trim() || null],
    ["From", draft.pickupPostcode.trim() ? draft.pickupPostcode.trim().toUpperCase() : null], ["To", draft.dropoffPostcode.trim() ? draft.dropoffPostcode.trim().toUpperCase() : null],
    ["Van", draft.vanType || null], ["Helpers", draft.helpers || null], ["Estimated hours", draft.hours || null],
    ["When", draft.date && draft.startTime ? `${formatCalendarDate(draft.date)}, ${draft.startTime} London` : null],
    ["Price", priceEntered && !priceErrors.price ? formatMoney(pence) : null]
  ];

  if (created) {
    const price = created.quotation?.versions.at(-1)?.totalPence ?? null;
    return (
      <Card className="mx-auto max-w-xl text-center">
        <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--bos-emerald-soft)] text-[var(--bos-emerald-fg)]"><Check className="h-6 w-6" /></span>
        <h2 ref={headingRef} tabIndex={-1} className="mt-3 text-[18px] font-semibold text-[var(--bos-ink)] outline-none">{problem ? "Enquiry saved, price not recorded" : "Enquiry saved"}</h2>
        <p className="mt-1 text-[13px] text-[var(--bos-ink-2)]">{created.reference} for {created.customer.name}. It is an enquiry, not a confirmed booking. {price === null ? "It has no price yet." : `Price recorded: ${formatMoney(price)} (manual).`}</p>
        {problem && <p role="alert" className="mt-3 rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">{problem} The enquiry exists; add the price from its page.</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {problem && priceEntered && <Button variant="secondary" disabled={saving} onClick={save}>Retry recording the price</Button>}
          <Button variant="primary" onClick={() => navigateTo(sectionHref("bookings", { view: "enquiries", enquiry: created.id }))}>Open enquiry</Button>
          <Button variant="secondary" onClick={() => { setCreated(null); setSaved(fresh()); setShown({}); setProblem(null); }}>Start another</Button>
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </Card>
    );
  }

  const e = shown;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        <ol aria-label="Steps" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {STEPS.map((s, i) => {
            const reached = i <= STEPS.indexOf(step), current = s === step;
            return (
              <li key={s} className="shrink-0">
                <button type="button" aria-current={current ? "step" : undefined} disabled={!reached} onClick={() => go(s)}
                  className={`flex min-h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold ${current ? "bg-[var(--bos-primary)] text-[var(--bos-on-accent)]" : reached ? "bg-[var(--bos-surface)] text-[var(--bos-ink)] ring-1 ring-[var(--bos-line)]" : "text-[var(--bos-ink-3)]"}`}>
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-black/10 text-[11px]">{i + 1}</span>{STEP_LABEL[s]}
                </button>
              </li>
            );
          })}
        </ol>

        <Card>
          <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-[17px] font-semibold text-[var(--bos-ink)] outline-none">{STEP_LABEL[step]}</h2>
          {Object.keys(e).length > 0 && <p role="alert" className="mb-4 rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">Some details need fixing before you continue.</p>}

          {step === "customer" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="w-name" label="Customer name" error={e.customerName}>{p => <input {...p} autoComplete="off" value={draft.customerName} onChange={x => set({ customerName: x.target.value })} />}</Field>
              <Field id="w-phone" label="Phone" error={e.phone} hint="A phone number or an email is needed.">{p => <input {...p} inputMode="tel" value={draft.phone} onChange={x => set({ phone: x.target.value })} />}</Field>
              <Field id="w-email" label="Email" error={e.email}>{p => <input {...p} type="email" value={draft.email} onChange={x => set({ email: x.target.value })} />}</Field>
              <div className="hidden sm:block" />
              <Field id="w-pa" label="Pickup address" error={e.pickupAddress}>{p => <input {...p} value={draft.pickupAddress} onChange={x => set({ pickupAddress: x.target.value })} />}</Field>
              <Field id="w-pp" label="Pickup postcode" error={e.pickupPostcode}>{p => <input {...p} autoCapitalize="characters" value={draft.pickupPostcode} onChange={x => set({ pickupPostcode: x.target.value })} />}</Field>
              <Field id="w-da" label="Destination address" error={e.dropoffAddress}>{p => <input {...p} value={draft.dropoffAddress} onChange={x => set({ dropoffAddress: x.target.value })} />}</Field>
              <Field id="w-dp" label="Destination postcode" error={e.dropoffPostcode}>{p => <input {...p} autoCapitalize="characters" value={draft.dropoffPostcode} onChange={x => set({ dropoffPostcode: x.target.value })} />}</Field>
            </div>
          )}

          {step === "requirements" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="w-van" label="Van type" error={e.vanType}>{p => <select {...p} value={draft.vanType} onChange={x => set({ vanType: x.target.value })}><option value="">Choose…</option>{VANS.map(v => <option key={v}>{v}</option>)}</select>}</Field>
              <Field id="w-prop" label="Property size">{p => <select {...p} value={draft.propertySize} onChange={x => set({ propertySize: x.target.value })}><option value="">Not stated</option>{PROPERTIES.map(v => <option key={v}>{v}</option>)}</select>}</Field>
              <Field id="w-help" label="Helpers" error={e.helpers}>{p => <input {...p} inputMode="numeric" value={draft.helpers} onChange={x => set({ helpers: x.target.value })} />}</Field>
              <Field id="w-hours" label="Estimated hours" error={e.hours}>{p => <input {...p} inputMode="decimal" value={draft.hours} onChange={x => set({ hours: x.target.value })} />}</Field>
              <Field id="w-ps" label="Pickup stairs">{p => <select {...p} value={draft.pickupStairs} onChange={x => set({ pickupStairs: x.target.value })}><option value="">Not stated</option>{STAIRS.map(v => <option key={v}>{v}</option>)}</select>}</Field>
              <Field id="w-ds" label="Destination stairs">{p => <select {...p} value={draft.dropoffStairs} onChange={x => set({ dropoffStairs: x.target.value })}><option value="">Not stated</option>{STAIRS.map(v => <option key={v}>{v}</option>)}</select>}</Field>
              <div className="sm:col-span-2"><Field id="w-inv" label="Inventory or notes">{p => <textarea {...p} rows={3} value={draft.notes} onChange={x => set({ notes: x.target.value })} />}</Field></div>
            </div>
          )}

          {step === "schedule" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="w-date" label="Moving date (London)" error={e.date}>{p => <input {...p} type="date" value={draft.date} onChange={x => set({ date: x.target.value })} />}</Field>
              <Field id="w-time" label="Start time (London, 24 hour)" error={e.startTime}>{p => <input {...p} type="time" value={draft.startTime} onChange={x => set({ startTime: x.target.value })} />}</Field>
              <p className="text-[13px] text-[var(--bos-ink-2)] sm:col-span-2">{window_ ? "Planned window follows from the estimated hours. Whether a driver and van are free is checked when you assign one, not here." : "Enter the date, time and estimated hours to see the planned window."}</p>
            </div>
          )}

          {step === "quote" && (
            <div className="space-y-4">
              <div role="note" className="rounded-xl border border-[var(--bos-amber)] bg-[var(--bos-amber-soft)] p-3 text-[13px] text-[var(--bos-ink)]">The pricing engine is not connected, so no price can be calculated. You can leave the price empty, or record one yourself with a reason. A price you enter is saved as a manual price.</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="w-price" label="Manual price (£), optional" error={e.price}>{p => <input {...p} inputMode="decimal" value={saved.price} onChange={x => setSaved(s => ({ ...s, price: x.target.value }))} />}</Field>
                <Field id="w-reason" label={priceEntered ? "Reason (required)" : "Reason"} error={e.reason}>{p => <input {...p} value={saved.reason} onChange={x => setSaved(s => ({ ...s, reason: x.target.value }))} />}</Field>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              {firstInvalid && <p role="alert" className="rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">The “{STEP_LABEL[firstInvalid]}” step still needs fixing. <button type="button" className="font-semibold underline" onClick={() => go(firstInvalid)}>Go to it</button></p>}
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">{summary.map(([k, v]) => <div key={k}><dt className="text-[12px] text-[var(--bos-ink-3)]">{k}</dt><dd className="text-[var(--bos-ink)]">{v ?? "Not provided"}</dd></div>)}</dl>
              <p className="text-[13px] text-[var(--bos-ink-2)]">Saving creates an enquiry. Nothing is sent to the customer and no booking is confirmed.</p>
              {problem && <p role="alert" className="rounded-xl bg-[var(--bos-coral-soft)] px-3 py-2 text-[13px] text-[var(--bos-coral-fg)]">{problem}</p>}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => (step === "customer" ? onClose() : go(STEPS[STEPS.indexOf(step) - 1]))}>{step === "customer" ? "Cancel" : "Back"}</Button>
            {step === "review" ? <Button variant="primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save enquiry"}</Button> : <Button variant="primary" onClick={next}>Continue</Button>}
          </div>
        </Card>
      </div>

      <aside aria-label="Summary" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <Card title="Summary" action={<StatusPill tone="neutral">Draft</StatusPill>}>
          <dl className="space-y-2 text-[13px]">{summary.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-[var(--bos-ink-3)]">{k}</dt><dd className="text-right text-[var(--bos-ink)]">{v ?? <span className="text-[var(--bos-ink-3)]">Not yet</span>}</dd></div>)}</dl>
          <p className="mt-3 text-[12px] text-[var(--bos-ink-3)]">{saved.savedAt ? "Draft kept in this browser." : "Your draft is kept in this browser as you type."}</p>
          <Button variant="ghost" className="mt-2" onClick={() => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setSaved(fresh()); setShown({}); }}>Discard draft</Button>
        </Card>
      </aside>
    </div>
  );
}
