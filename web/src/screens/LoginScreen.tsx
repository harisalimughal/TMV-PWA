import React, { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login, type ApiError, type DriverProfile } from "../api/auth";

interface LoginScreenProps {
  onLoggedIn: (driver: DriverProfile) => void;
  onForgotPassword: () => void;
}

export function LoginScreen({ onLoggedIn, onForgotPassword }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const driver = await login(email.trim(), password);
      onLoggedIn(driver);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message || "Couldn't sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center gap-3 mb-10">
            {/* White card behind the logo -- the source PNG has a white/light
                background, not transparent, so it needs a light backdrop to sit
                cleanly on this screen's dark navy background (same treatment the
                admin dashboard's Layout.tsx uses for the same asset). */}
            <div className="w-24 h-24 rounded-2xl bg-white p-2.5 shadow-lg flex items-center justify-center">
              <img src="/tmv-logo.png" alt="The Man Van" className="w-full h-full object-contain" />
            </div>
            <p className="text-sm text-white/50">Sign in to see your jobs</p>
          </div>

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

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-white/60 pl-1">Password</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
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
              <button
                type="button"
                onClick={onForgotPassword}
                className="self-end text-xs text-brand hover:text-brand-dark pt-1"
              >
                Forgot password?
              </button>
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
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-xs text-white/40 mt-6">
            New account? Your manager will email you a link to set your password.
          </p>
        </div>
      </div>
    </div>
  );
}
