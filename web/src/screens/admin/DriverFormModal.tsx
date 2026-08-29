import React, { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Modal } from "../../components/Modal";
import { saveDriver, type AdminDriver, type ApiError } from "../../api/admin";

interface DriverFormModalProps {
  driver: AdminDriver | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Add/Edit Driver -- replaces TMV-Chat-bot's old Sheets-backed form. Upserts on
 * email, same as before: resubmitting the same email edits that driver. */
export function DriverFormModal({ driver, onClose, onSaved }: DriverFormModalProps) {
  const isEdit = Boolean(driver);
  const [email, setEmail] = useState(driver?.email ?? "");
  const [initials, setInitials] = useState(driver?.initials ?? "");
  const [fullName, setFullName] = useState(driver?.fullName ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [vanRegistration, setVanRegistration] = useState(driver?.vanRegistration ?? "");
  const [role, setRole] = useState(driver?.role ?? "Driver");
  const [active, setActive] = useState(driver?.active ?? true);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (!email.trim() || !initials.trim() || !fullName.trim()) {
      setError("Email, initials and full name are required.");
      return;
    }
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await saveDriver({
        email: email.trim(),
        initials: initials.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        vanRegistration: vanRegistration.trim(),
        role: role.trim(),
        active,
        password: password || undefined
      });
      if (result.warning) setError(result.warning);
      else onSaved();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message || "Couldn't save this driver. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit Driver" : "Add Driver"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Full name">
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            disabled={submitting}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Initials">
            <input
              value={initials}
              onChange={e => setInitials(e.target.value.toUpperCase())}
              disabled={submitting}
              maxLength={5}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <input value={role} onChange={e => setRole(e.target.value)} disabled={submitting} className={inputClass} />
          </Field>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={submitting || isEdit}
            className={`${inputClass} ${isEdit ? "opacity-50" : ""}`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={submitting} className={inputClass} />
          </Field>
          <Field label="Van registration">
            <input
              value={vanRegistration}
              onChange={e => setVanRegistration(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label={isEdit ? "New app password (leave blank to keep current)" : "App password"}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={submitting}
            placeholder={isEdit ? "••••••••" : "At least 8 characters"}
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            disabled={submitting}
            className="w-4 h-4 shrink-0 accent-[#1B75BC]"
          />
          <span className="text-sm text-white/80">Active (can log in and be assigned jobs)</span>
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Saving…" : "Save driver"}
        </button>
      </form>
    </Modal>
  );
}

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-white/60 pl-1">{label}</span>
      {children}
    </label>
  );
}
