/**
 * Add / edit driver. Grouped as identity (name, unique code, sign-in email), vehicle
 * (registration and GPS tracker), and app access (status, password) -- audit p.17.
 * Validation is inline; nothing the admin typed is cleared when a save fails.
 * There is no invite / password-reset endpoint, so the password is still set here.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDrivers, fetchLiveFleet, saveDriver } from "../api";
import { DRIVER_OPTIONS_QUERY_KEY } from "../hooks/useDriverOptions";
import { Modal } from "../../../../ui/Modal";
import { Action, Notice, controlBase } from "./ds";
import { cx } from "../../../../ui/cx";

export interface DriverEditTarget {
  initials: string;
  fullName: string;
  email: string;
  phone?: string;
  vanRegistration?: string;
  imei?: string;
  active: boolean;
}

interface Props { isOpen: boolean; onClose: () => void; driverToEdit?: DriverEditTarget | null }

type Field = "name" | "code" | "email" | "password";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddDriverModal({ isOpen, onClose, driverToEdit }: Props) {
  const queryClient = useQueryClient();
  const editing = !!driverToEdit;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouchedByUser, setCodeTouchedByUser] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [imei, setImei] = useState("");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");

  // Summary rows carry each driver's tracker IMEI and which codes belong to a real
  // account (job-only codes must not block creating that account).
  const summary = useQuery({ queryKey: ["drivers_summary"], queryFn: () => fetchDrivers(), enabled: isOpen });
  const fleet = useQuery({ queryKey: ["fleet_live"], queryFn: fetchLiveFleet, enabled: isOpen });
  const devices = fleet.data?.vehicles ?? [];
  const existingImei = useMemo(() => driverToEdit?.imei ?? summary.data?.drivers.find(row => row.hasAccount && row.initials === driverToEdit?.initials)?.imei ?? "", [driverToEdit, summary.data]);

  useEffect(() => {
    if (!isOpen) return;
    setName(driverToEdit?.fullName ?? ""); setCode(driverToEdit?.initials ?? ""); setCodeTouchedByUser(!!driverToEdit);
    setEmail(driverToEdit?.email ?? ""); setPhone(driverToEdit?.phone ?? ""); setVehicleReg(driverToEdit?.vanRegistration ?? "");
    setActive(driverToEdit ? driverToEdit.active !== false : true); setPassword("");
    setTouched(new Set()); setSubmitted(false); setSaveError(""); setSaveWarning("");
  }, [driverToEdit, isOpen]);
  // The tracker comes from a separate request; fill it once known without
  // overwriting a choice the admin has already made.
  useEffect(() => { if (isOpen && existingImei && !imei) setImei(existingImei); }, [existingImei, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const upperCode = code.trim().toUpperCase();
  const codeTaken = (summary.data?.drivers ?? []).some(row => row.hasAccount && row.initials === upperCode && driverToEdit?.initials !== upperCode);
  const errors: Partial<Record<Field, string>> = {
    name: !name.trim() ? "Enter the driver's full name." : undefined,
    code: !upperCode ? "Enter a driver code." : upperCode !== driverToEdit?.initials && !/^[A-Z0-9]{2}$/.test(upperCode) ? "Use exactly 2 letters or numbers." : codeTaken ? "This code already belongs to another driver." : undefined,
    email: !email.trim() ? "Enter the email the driver signs in with." : !EMAIL.test(email.trim()) ? "Enter a valid email address." : undefined,
    password: password && password.length < 8 ? "Use at least 8 characters." : undefined
  };
  const show = (field: Field) => (submitted || touched.has(field)) && errors[field];
  const touch = (field: Field) => setTouched(previous => new Set(previous).add(field));

  const submit = async () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true); setSaveError(""); setSaveWarning("");
    try {
      const result = await saveDriver({ initials: upperCode, fullName: name.trim(), email: email.trim(), active, phone: phone.trim(), vanRegistration: vehicleReg.trim(), imei, ...(password ? { password } : {}) });
      void queryClient.invalidateQueries({ queryKey: ["drivers_summary"] });
      void queryClient.invalidateQueries({ queryKey: DRIVER_OPTIONS_QUERY_KEY });
      if (result.warning) setSaveWarning(result.warning); else onClose();
    } catch (err) {
      setSaveError((err as Error)?.message || "The driver could not be saved. Your entries are kept — try again.");
    } finally { setSaving(false); }
  };

  const label = (text: string, required = false) => <span className="text-[13px] font-medium text-admin-ink">{text}{required && <span className="text-admin-status-red"> *</span>}{required && <span className="sr-only"> (required)</span>}</span>;
  const error = (field: Field) => show(field) ? <span id={`driver-${field}-error`} className="mt-1 block text-[12.5px] text-admin-status-red">{errors[field]}</span> : null;
  const input = (field: Field) => cx(controlBase, "mt-1 w-full", show(field) && "border-admin-status-red focus:border-admin-status-red focus:ring-admin-status-red/20");

  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${driverToEdit!.fullName}` : "Add driver"} size="lg" placement="center" dismissible={!saving}
      footer={saveWarning ? <div className="flex justify-end"><Action variant="primary" onClick={onClose}>Done</Action></div> : (
        <div className="flex justify-end gap-2"><Action variant="ghost" onClick={onClose} disabled={saving}>Cancel</Action><Action variant="primary" loading={saving} onClick={() => void submit()}>{editing ? "Save changes" : "Add driver"}</Action></div>
      )}>
      <form noValidate onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-5">
        {saveError && <Notice tone="danger">{saveError}</Notice>}
        {saveWarning && <Notice tone="warning" title="Saved with a warning">{saveWarning}</Notice>}
        <fieldset className="space-y-3">
          <legend className="text-[15px] font-semibold text-admin-ink">Driver</legend>
          <label className="block">{label("Full name", true)}
            <input value={name} autoComplete="off" onBlur={() => touch("name")} aria-invalid={!!show("name")} aria-describedby={show("name") ? "driver-name-error" : undefined}
              onChange={event => { setName(event.target.value); if (!editing && !codeTouchedByUser) setCode(event.target.value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()); }} className={input("name")} />
            {error("name")}
          </label>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="block">{label("Driver code", true)}
              <input value={code} maxLength={2} onBlur={() => touch("code")} aria-invalid={!!show("code")} aria-describedby="driver-code-help"
                onChange={event => { setCode(event.target.value.toUpperCase()); setCodeTouchedByUser(true); }} className={cx(input("code"), "uppercase")} />
              <span id="driver-code-help" className="mt-1 block text-[12.5px] text-admin-ink-2">2 characters, unique</span>
              {error("code")}
            </label>
            <label className="block">{label("Sign-in email", true)}
              <input type="email" value={email} onBlur={() => touch("email")} aria-invalid={!!show("email")} aria-describedby={show("email") ? "driver-email-error" : undefined}
                onChange={event => setEmail(event.target.value)} className={input("email")} />
              {error("email")}
            </label>
          </div>
          <label className="block">{label("Phone")}<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className={cx(controlBase, "mt-1 w-full")} /></label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-admin-line pt-4">
          <legend className="text-[15px] font-semibold text-admin-ink">Vehicle</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">{label("Vehicle registration")}
              <input value={vehicleReg} onChange={event => setVehicleReg(event.target.value.toUpperCase())} className={cx(controlBase, "mt-1 w-full font-mono uppercase")} placeholder="AB12 CDE" />
            </label>
            <label className="block">{label("GPS tracker")}
              <select value={imei} onChange={event => setImei(event.target.value)} className={cx(controlBase, "mt-1 w-full")}>
                <option value="">{fleet.isLoading ? "Loading trackers…" : "Not assigned"}</option>
                {imei && !devices.some(device => device.imei === imei) && <option value={imei}>{imei} (not reporting now)</option>}
                {devices.map(device => <option key={device.imei} value={device.imei}>{device.plateNumber || device.name}{device.plateNumber && device.name !== device.plateNumber ? ` (${device.name})` : ""}</option>)}
              </select>
              {fleet.isError && <span className="mt-1 block text-[12.5px] text-admin-status-amber">Tracker list unavailable; the current assignment is kept.</span>}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-admin-line pt-4">
          <legend className="text-[15px] font-semibold text-admin-ink">App access</legend>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} className="mt-0.5 h-5 w-5 accent-admin-brand" />
            <span><span className="block text-[14px] font-medium">Account active</span><span className="block text-[13px] text-admin-ink-2">{active ? "The driver can sign in and see assigned jobs." : "The driver is blocked from signing in."}</span></span>
          </label>
          <label className="block">{label(editing ? "New app password" : "App password")}
            <input type="password" value={password} autoComplete="new-password" onBlur={() => touch("password")} aria-invalid={!!show("password")} aria-describedby="driver-password-help"
              onChange={event => setPassword(event.target.value)} className={input("password")} />
            <span id="driver-password-help" className="mt-1 block text-[12.5px] text-admin-ink-2">{editing ? "Leave blank to keep the current password." : "At least 8 characters. Without one the driver can't sign in until it is set."}</span>
            {error("password")}
          </label>
        </fieldset>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
