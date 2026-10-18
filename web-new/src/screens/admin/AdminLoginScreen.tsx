import React, { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { adminLogin, type ApiError } from "../../api/admin";
import { Button, IconButton } from "../../ui";

interface AdminLoginScreenProps {
  onLoggedIn: () => void;
}

/**
 * Ported from TMV-Chat-bot's dashboard LoginPage, then brought onto the shared
 * design system: the app <Button>, the semantic type scale and one control radius,
 * so it reads as the same product as the driver app rather than a separate port.
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4 font-sans sm:p-8">
      <div className="mb-8 flex items-center justify-center">
        <div className="flex size-20 items-center justify-center rounded-panel bg-surface p-2 shadow-md">
          <img src="/tmv-logo.png" alt="The Man Van" className="h-full w-full object-contain" />
        </div>
      </div>

      <div className="w-full max-w-[440px] rounded-module border border-line bg-surface p-8 shadow-sm sm:p-10">
        <div className="mb-8 text-center">
          <h1 className="mb-1.5 text-title text-fg">Sign in to Operations</h1>
          <p className="text-body text-fg-muted">Enter the admin password to access the dashboard</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-card border border-danger-line bg-danger-subtle p-3 text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="text-label font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-pw" className="text-label font-semibold text-fg">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                id="admin-pw"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                autoFocus
                className="h-control w-full rounded-control border border-line bg-surface-sunken pl-10 pr-12 text-fg outline-none transition-colors focus:border-brand focus:bg-surface"
              />
              <IconButton
                aria-label={showPassword ? "Hide password" : "Show password"}
                icon={showPassword ? <EyeOff /> : <Eye />}
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              />
            </div>
          </div>

          <Button type="submit" size="lg" fullWidth loading={isLoading} className="mt-1">
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>

      <p className="mt-8 text-meta font-medium text-fg-subtle">
        © {new Date().getFullYear()} The Man Van Operations
      </p>
    </div>
  );
}
