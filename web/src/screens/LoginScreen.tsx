import React, { useId, useState } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { login, type ApiError, type DriverProfile } from "../api/auth";
import { Alert, Button, Field, Input } from "../ui";
import { AuthHeading, AuthLayout, PasswordToggle, usePasswordVisibility } from "./auth/AuthKit";
import { useOnline } from "../lib/net";
import { SERVER_ERROR_MESSAGE } from "../lib/apiErrors";

interface LoginScreenProps {
  onLoggedIn: (driver: DriverProfile) => void;
  onForgotPassword: () => void;
  /** Set when the driver landed here because their session expired mid-job. */
  notice?: string | null;
}

export function LoginScreen({ onLoggedIn, onForgotPassword, notice }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [missing, setMissing] = useState(false);
  // "credentials" (a 401 -- deliberately generic either way, never revealing which of
  // the two was wrong or whether the account exists) vs "server" (anything else: a
  // 5xx, offline, timeout) -- our infrastructure being down is not the same failure as
  // a wrong password, and telling a driver to "check your password" during an outage
  // is actively misleading, not just unhelpful.
  const [authError, setAuthError] = useState<"credentials" | "server" | null>(null);
  const pw = usePasswordVisibility();
  const online = useOnline();
  const pwId = useId();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setMissing(false);
    setAuthError(null);

    if (!email.trim() || !password) {
      setMissing(true);
      return;
    }

    setSubmitting(true);
    try {
      onLoggedIn(await login(email.trim(), password));
    } catch (err) {
      setAuthError((err as ApiError)?.status === 401 ? "credentials" : "server");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthHeading title="Sign in" />

      {notice && (
        <Alert tone="warning" className="mb-4">
          {notice}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email address">
          {p => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              prefix={<Mail />}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="you@themanvan.co.uk"
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={pwId} className="text-label font-semibold text-fg">
              Password
            </label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-label font-medium text-brand hover:text-brand-hover"
            >
              Forgot password?
            </button>
          </div>
          <Input
            id={pwId}
            type={pw.type}
            autoComplete="current-password"
            prefix={<Lock />}
            suffix={<PasswordToggle shown={pw.shown} onToggle={pw.toggle} />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={submitting}
            placeholder="Your password"
          />
        </div>

        {missing && <Alert tone="danger">Enter your email and password.</Alert>}
        {authError === "credentials" && (
          <Alert tone="danger" title="Unable to sign in">
            Check your email and password and try again.
          </Alert>
        )}
        {authError === "server" && (
          <Alert tone="danger" title="Unable to sign in">
            {SERVER_ERROR_MESSAGE}
          </Alert>
        )}
        {!online && <Alert tone="warning">You're offline. Signing in needs a connection.</Alert>}

        <Button type="submit" size="lg" fullWidth loading={submitting} iconRight={<ArrowRight />} className="mt-1">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-8 text-helper text-fg-muted">Having trouble signing in? Contact operations.</p>
    </AuthLayout>
  );
}
