import React, { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { adminLogin, type ApiError } from "../../api/admin";

interface AdminLoginScreenProps {
  onLoggedIn: () => void;
}

/**
 * Ported verbatim (layout, copy, colors) from TMV-Chat-bot's dashboard/web/src/pages
 * /LoginPage.tsx, at the user's explicit request -- same "Sign in to Operations" card,
 * same admin-* color tokens (see tailwind.config.js). Only the submit call changed:
 * this posts to tmv-pwa's own /api/admin/login (Mongo-backed, no Sheets dependency),
 * not TMV-Chat-bot's /admin/api/auth/login. The one deliberate improvement over the
 * source: the real logo (tmv-logo.png) in place of the generic "MV" letter badge.
 */
export function AdminLoginScreen({ onLoggedIn }: AdminLoginScreenProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setIsLoading(true);
    try {
      await adminLogin(password);
      onLoggedIn();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message || "Incorrect password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-admin-bg flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      {/* LOGO */}
      <div className="mb-8 flex items-center justify-center">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg p-2">
          <img src="/tmv-logo.png" alt="The Man Van" className="w-full h-full object-contain" />
        </div>
      </div>

      {/* CARD */}
      <div className="w-full max-w-[440px] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-admin-line p-8 sm:p-10">
        <div>
          <div className="text-center mb-8">
            <h1 className="text-[20px] font-bold text-admin-ink mb-2">Sign in to Operations</h1>
            <p className="text-[14px] text-admin-muted">Enter the admin password to access the dashboard</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-admin-status-red-bg border border-[#FECACA] rounded-xl flex items-center gap-3 text-[#B91C1C]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-[13px] font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-admin-ink">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-admin-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  autoFocus
                  className="w-full h-11 pl-10 pr-12 rounded-full bg-admin-surface border border-admin-line text-[14px] text-admin-ink focus:border-admin-brand focus:bg-white outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-admin-muted hover:text-admin-ink transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[46px] mt-2 rounded-full bg-[#1A1A1A] hover:bg-black text-white text-[14px] font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 text-center space-y-2">
        <p className="text-[12px] text-admin-muted font-medium">© {new Date().getFullYear()} The Man Van Operations</p>
      </div>
    </div>
  );
}
