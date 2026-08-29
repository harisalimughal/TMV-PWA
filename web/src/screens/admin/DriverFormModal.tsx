import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { saveDriver, type AdminDriver, type ApiError } from "../../api/admin";

interface Props {
  driver: AdminDriver | null;
  existingDrivers: AdminDriver[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Ported from TMV-Chat-bot's dashboard/web/src/components/AddDriverModal.tsx -- same
 * layout, fields, and copy. Saves through tmv-pwa's own /api/admin/drivers (Mongo),
 * not the Sheets-backed dashboard.route.ts this was copied from.
 */
export function DriverFormModal({ driver, existingDrivers, onClose, onSaved }: Props) {
  const isEdit = Boolean(driver);
  const [name, setName] = useState(driver?.fullName ?? "");
  const [code, setCode] = useState(driver?.initials ?? "");
  const [vehicleReg, setVehicleReg] = useState(driver?.vanRegistration ?? "");
  const [email, setEmail] = useState(driver?.email ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [active, setActive] = useState(driver?.active ?? true);
  const [pwaPassword, setPwaPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");

  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit && (!code || code.length < 2)) {
      setCode(val.substring(0, 2).toUpperCase());
    }
  }

  const isCodeTaken = existingDrivers.some(
    d => d.initials === code.toUpperCase() && (!driver || driver.initials !== code.toUpperCase())
  );
  const passwordTooShort = pwaPassword.length > 0 && pwaPassword.length < 8;

  async function handleSubmit() {
    setSaveError("");
    setSaveWarning("");
    setIsSaving(true);
    try {
      const result = await saveDriver({
        initials: code.toUpperCase(),
        fullName: name,
        email,
        active,
        phone,
        vanRegistration: vehicleReg,
        role: driver?.role ?? "Driver",
        // Omitted (not sent empty) when blank, so editing a driver without touching
        // this field never resets/clears their existing app password.
        ...(pwaPassword ? { password: pwaPassword } : {})
      });
      if (result.warning) {
        // Stay open so the warning is actually seen -- the save did succeed, this
        // isn't a failure, but silently closing would hide that the password part
        // didn't take.
        setSaveWarning(result.warning);
      } else {
        onSaved();
      }
    } catch (err) {
      const apiError = err as ApiError;
      setSaveError(apiError?.message || "Failed to save driver.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-admin-line flex items-center justify-between shrink-0">
          <h2 className="text-[18px] font-bold text-admin-ink">{isEdit ? "Edit Driver" : "Add New Driver"}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-admin-muted hover:text-admin-ink hover:bg-admin-surface rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">
                Full Name <span className="text-admin-status-red">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                className="w-full h-11 px-3 rounded-[12px] border border-admin-line bg-admin-surface text-[14px] text-admin-ink outline-none focus:border-admin-brand focus:bg-white transition"
                placeholder="e.g. John Doe"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">
                Driver Code (2-letter) <span className="text-admin-status-red">*</span>
              </label>
              <input
                type="text"
                maxLength={2}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className={`w-full h-11 px-3 rounded-[12px] border ${
                  isCodeTaken ? "border-admin-status-red focus:border-admin-status-red" : "border-admin-line focus:border-admin-brand"
                } bg-admin-surface text-[14px] text-admin-ink outline-none focus:bg-white transition uppercase`}
                placeholder="e.g. JD"
              />
              {isCodeTaken && <span className="text-[11px] text-admin-status-red mt-1 block">This code is already in use.</span>}
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">Vehicle Registration</label>
              <input
                type="text"
                value={vehicleReg}
                onChange={e => setVehicleReg(e.target.value.toUpperCase())}
                className="w-full h-11 px-3 rounded-[12px] border border-admin-line bg-admin-surface text-[14px] font-mono text-admin-ink outline-none focus:border-admin-brand focus:bg-white transition uppercase"
                placeholder="e.g. AB12 CDE"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">
                Email Address <span className="text-admin-status-red">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isEdit}
                className={`w-full h-11 px-3 rounded-[12px] border border-admin-line bg-admin-surface text-[14px] text-admin-ink outline-none focus:border-admin-brand focus:bg-white transition ${
                  isEdit ? "opacity-60" : ""
                }`}
                placeholder="driver@example.com"
              />
              <span className="text-[11px] text-admin-muted mt-1 block">Used to sign the driver into the app, and as the unique key for this record.</span>
            </div>

            <div className="col-span-2">
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full h-11 px-3 rounded-[12px] border border-admin-line bg-admin-surface text-[14px] text-admin-ink outline-none focus:border-admin-brand focus:bg-white transition"
                placeholder="07..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">Driver App Password</label>
              <input
                type="password"
                value={pwaPassword}
                onChange={e => setPwaPassword(e.target.value)}
                className={`w-full h-11 px-3 rounded-[12px] border ${
                  passwordTooShort ? "border-admin-status-red focus:border-admin-status-red" : "border-admin-line focus:border-admin-brand"
                } bg-admin-surface text-[14px] text-admin-ink outline-none focus:bg-white transition`}
                placeholder={isEdit ? "Leave blank to keep current password" : "Set a password (min 8 characters)"}
                autoComplete="new-password"
              />
              {passwordTooShort ? (
                <span className="text-[11px] text-admin-status-red mt-1 block">Must be at least 8 characters.</span>
              ) : (
                <span className="text-[11px] text-admin-muted mt-1 block">
                  Login for the driver app.{isEdit ? " Leave blank to keep their current password unchanged." : ""}
                </span>
              )}
            </div>

            <div className="col-span-2 mt-4 pt-4 border-t border-admin-line">
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-3">System Access &amp; Status</label>
              <div
                className={`p-4 rounded-[12px] border transition-colors ${
                  active ? "bg-admin-status-green-bg border-admin-status-green/20" : "bg-admin-status-red-bg border-[#FECACA]"
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={e => setActive(e.target.checked)}
                      className="w-5 h-5 text-admin-brand rounded focus:ring-admin-brand"
                    />
                  </div>
                  <div>
                    <span className={`text-[14px] font-bold block ${active ? "text-admin-status-green" : "text-admin-status-red"}`}>
                      {active ? "Active (App Access Enabled)" : "Deactivated (Access Revoked)"}
                    </span>
                    <p className={`text-[13px] mt-1 ${active ? "text-admin-status-green/80" : "text-admin-status-red/80"}`}>
                      {active
                        ? "Driver can log in, view assignments, and complete jobs."
                        : "Driver is immediately blocked from the app. Future assignments are stopped."}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-admin-line bg-admin-surface shrink-0">
          {saveError && (
            <p className="text-[12px] text-admin-status-red font-medium mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {saveError}
            </p>
          )}
          {saveWarning && (
            <p className="text-[12px] text-amber-700 font-medium mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {saveWarning}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            {saveWarning ? (
              <button
                onClick={onSaved}
                className="px-6 py-2 rounded-[12px] bg-admin-brand hover:bg-admin-brand-dark text-white text-[13px] font-semibold shadow-sm transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-[12px] text-[13px] font-semibold text-admin-muted hover:text-admin-ink transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving || isCodeTaken || passwordTooShort || !name || !code || !email}
                  className="px-6 py-2 rounded-[12px] bg-admin-brand disabled:bg-[#93C5FD] disabled:cursor-not-allowed hover:bg-admin-brand-dark text-white text-[13px] font-semibold shadow-sm transition"
                >
                  {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Add Driver"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
