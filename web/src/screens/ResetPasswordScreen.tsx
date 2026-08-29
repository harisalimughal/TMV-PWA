import React, { useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { resetPassword, type DriverProfile } from "../api/auth";

interface ResetPasswordScreenProps {
  token: string;
  onDone: (driver: DriverProfile) => void;
}

export function ResetPasswordScreen({ token, onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const driver = await resetPassword(token, password);
      onDone(driver);
    } catch (err: any) {
      setError(err?.message || "Couldn't reset your password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-20 h-20 rounded-2xl bg-white p-2 shadow-lg flex items-center justify-center">
              <img src="/tmv-logo.png" alt="The Man Van" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-bold">Set a new password</h1>
            <p className="text-sm text-white/50 text-center">Choose a new password for your driver account.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-white/60 pl-1">New password</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-11 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {tooShort && <span className="text-xs text-amber-400 pl-1">At least 8 characters.</span>}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-white/60 pl-1">Confirm password</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={submitting}
                  placeholder="Re-enter your new password"
                  className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>
              {mismatch && <span className="text-xs text-amber-400 pl-1">Passwords don't match.</span>}
            </label>

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
