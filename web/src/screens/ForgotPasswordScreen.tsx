import React, { useState } from "react";
import { ArrowLeft, Loader2, Mail, Truck } from "lucide-react";
import { forgotPassword } from "../api/auth";

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

export function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Couldn't send the reset link. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="px-4 pt-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white/90 py-2">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center">
              <Truck className="w-8 h-8 text-brand" />
            </div>
            <h1 className="text-xl font-bold">Reset your password</h1>
            <p className="text-sm text-white/50 text-center">
              Enter your email and we'll send you a link to set a new password.
            </p>
          </div>

          {sent ? (
            <div className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-4 py-3 text-center">
              If that email has a driver account, we've sent a password reset link. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-white/60 pl-1">Email</span>
                <div className="relative">
                  <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={submitting}
                    placeholder="you@themanvan.co.uk"
                    className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand disabled:opacity-50"
                  />
                </div>
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
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
