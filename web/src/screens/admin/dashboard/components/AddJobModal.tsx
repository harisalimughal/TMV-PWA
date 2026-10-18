import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { addJob } from "../api";
import { fetchDrivers } from "../../../../api/admin";
import { DRIVER_OPTIONS_QUERY_KEY } from "../hooks/useDriverOptions";
import { Modal, ConfirmDialog } from "../../../../ui";
import { Action, Notice, controlBase } from "./ds";
import { useUnsavedChanges } from "../utils/unsavedChanges";

const EMPTY = { customerName: "", customerEmail: "", customerPhone: "", pickup: "", dropoff: "", crewSize: "2", price: "", paidOnline: true, start: "", finish: "", driverId: "" };
type BookingDraft = typeof EMPTY;
export function validateBooking(form: BookingDraft): string | null {
  if (![form.customerName, form.pickup, form.dropoff, form.price, form.start, form.finish].every(value => value.trim())) return "Enter the customer, both addresses, price, start and finish.";
  if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) return "Enter a valid non-negative price.";
  if (!Number.isInteger(Number(form.crewSize)) || Number(form.crewSize) < 1) return "Crew size must be a positive whole number.";
  if (!Number.isFinite(Date.parse(form.start)) || !Number.isFinite(Date.parse(form.finish)) || form.finish <= form.start) return "Finish must be after the start time.";
  if (form.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) return "Enter a valid customer email address.";
  return null;
}

/** Retains the established booking payload, including its confirmation flag and local datetime strings. */
export function AddJobModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated?: () => void }) {
  const client = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY);
  useUnsavedChanges("new-booking", isOpen && dirty);
  const roster = useQuery({ queryKey: DRIVER_OPTIONS_QUERY_KEY, queryFn: fetchDrivers, enabled: isOpen });
  // Same roster rule as useDriverOptions: real, active accounts only (never the UNASSIGNED placeholder).
  const drivers = (roster.data ?? []).filter(driver => driver.active && driver.initials && driver.initials !== "UNASSIGNED");
  const change = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const close = () => { if (submitting.current) return; if (dirty) setDiscard(true); else onClose(); };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const invalid = validateBooking(form);
    if (invalid) { setError(invalid); return; }
    if (form.driverId && !drivers.some(driver => driver.initials === form.driverId)) { setError("The selected driver is no longer available. Choose another driver or leave the job unassigned."); return; }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await addJob({ customerName: form.customerName.trim(), customerEmail: form.customerEmail.trim() || undefined, customerPhone: form.customerPhone.trim() || undefined,
        pickup: form.pickup.trim(), dropoff: form.dropoff.trim(), crewSize: Number(form.crewSize), price: Number(form.price), paidOnline: form.paidOnline,
        driverInitials: form.driverId || undefined, start: form.start, finish: form.finish });
      for (const key of ["jobs", "summary", "range_jobs", "today_jobs", "drivers_summary"]) void client.invalidateQueries({ queryKey: [key] });
      onCreated?.();
      onClose();
    } catch (cause) {
      const reason = ((cause as Error)?.message || "The booking could not be created").trim();
      setError(`${/[.!?]$/.test(reason) ? reason : `${reason}.`} If the connection was interrupted, check Jobs before retrying to avoid creating a duplicate.`);
    } finally { submitting.current = false; setSaving(false); }
  }
  const input = (key: Exclude<keyof BookingDraft, "paidOnline" | "driverId">, label: string, type = "text", required = false) => (
    <label className="grid gap-1.5 text-[13px] font-medium text-admin-ink" htmlFor={`booking-${key}`}>
      {label}{required && <span className="sr-only"> (required)</span>}
      <input id={`booking-${key}`} name={key} type={type} required={required} value={form[key]} disabled={saving}
        min={key === "price" ? "0" : key === "crewSize" ? "1" : undefined} step={key === "price" ? "0.01" : key === "crewSize" ? "1" : undefined}
        onChange={event => change(key, event.target.value)} className={`${controlBase} w-full`} />
    </label>
  );
  return <>
    <Modal open={isOpen} title="Create a job" onClose={close} dismissible={!saving} size="xl"
      footer={<div className="flex justify-end gap-2"><Action onClick={close} disabled={saving}>Cancel</Action><Action type="submit" form="create-booking" variant="primary" icon={<Plus />} loading={saving}>Create job</Action></div>}>
      <form id="create-booking" onSubmit={save} className="space-y-5">
        <p className="text-[13px] text-admin-ink-2">Create a Calendar booking. It appears in Jobs once synchronized; adjust your date and status filters if needed.</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <fieldset disabled={saving} className="space-y-3">
          <legend className="mb-3 text-[15px] font-semibold text-admin-ink">Customer & route</legend>
          {input("customerName", "Customer name", "text", true)}
          <div className="grid gap-3 sm:grid-cols-2">{input("customerEmail", "Email (optional)", "email")}{input("customerPhone", "Phone (optional)", "tel")}</div>
          {input("pickup", "Pickup address", "text", true)}{input("dropoff", "Drop-off address", "text", true)}
        </fieldset>
        <fieldset disabled={saving} className="space-y-3 border-t border-admin-line pt-4">
          <legend className="text-[15px] font-semibold text-admin-ink">Schedule & assignment</legend>
          <div className="grid gap-3 sm:grid-cols-2">{input("start", "Start", "datetime-local", true)}{input("finish", "Finish", "datetime-local", true)}</div>
          <div className="grid gap-3 sm:grid-cols-2">{input("crewSize", "Crew size", "number", true)}{input("price", "Booking price (£)", "number", true)}</div>
          <label className="grid gap-1.5 text-[13px] font-medium text-admin-ink" htmlFor="booking-driver">Driver
            <select id="booking-driver" value={form.driverId} disabled={saving || roster.isLoading || roster.isError} onChange={event => change("driverId", event.target.value)} className={`${controlBase} w-full`}>
              <option value="">Unassigned</option>{drivers.map(driver => <option key={driver.initials} value={driver.initials}>{driver.fullName || driver.initials}</option>)}
            </select>
          </label>
          {roster.isLoading && <p role="status" className="text-sm text-admin-ink-2">Loading drivers…</p>}
          {roster.isError && <Notice tone="warning" action={<Action size="sm" onClick={() => void roster.refetch()}>Retry drivers</Action>}>Driver accounts could not load. You can create an unassigned job.</Notice>}
          <label className="flex items-start gap-2 text-[13px] text-admin-ink"><input type="checkbox" checked={form.paidOnline} onChange={event => change("paidOnline", event.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />Paid online / booking confirmed</label>
          <p className="text-[12px] text-admin-ink-2">Only confirmed bookings are synchronized to Jobs.</p>
        </fieldset>
      </form>
    </Modal>
    <ConfirmDialog open={discard} title="Discard this booking?" body="Your unsaved booking details will be lost." confirmLabel="Discard booking" cancelLabel="Keep editing" onClose={() => setDiscard(false)} onConfirm={onClose} tone="danger" />
  </>;
}
