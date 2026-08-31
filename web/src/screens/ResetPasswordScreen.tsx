import React, { useState } from "react";
import { Lock } from "lucide-react";
import { resetPassword, type ApiError, type DriverProfile } from "../api/auth";
import { Alert, Button, cx, Field, Input } from "../ui";
import { AuthBrand, AuthHeading, AuthLayout, PasswordToggle, usePasswordVisibility } from "./auth/AuthKit";

interface ResetPasswordScreenProps {
  token: string;
  onDone: (driver: DriverProfile) => void;
}

const MIN_LENGTH = 8;

/** A three-step meter is enough guidance without pretending to be a security audit. */
function strengthOf(password: string): { score: 0 | 1 | 2 | 3; label: string; tone: string } {
  if (password.length < MIN_LENGTH) return { score: 0, label: "Too short", tone: "bg-danger" };
  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 12) score = 3;
  if (score >= 3) return { score: 3, label: "Strong", tone: "bg-success" };
  if (score === 2) return { score: 2, label: "Good", tone: "bg-success" };
  return { score: 1, label: "Weak", tone: "bg-warning" };
}

export function ResetPasswordScreen({ token, onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pw = usePasswordVisibility();

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const strength = strengthOf(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      onDone(await resetPassword(token, password));
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't reset your password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <AuthBrand />
      <AuthHeading title="Set a new password" hint="Choose a new password for your driver account." />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="New password"
          hint={`At least ${MIN_LENGTH} characters`}
          error={tooShort ? `At least ${MIN_LENGTH} characters.` : undefined}
        >
          {p => (
            <Input
              {...p}
              type={pw.type}
              autoComplete="new-password"
              prefix={<Lock />}
              suffix={<PasswordToggle shown={pw.shown} onToggle={pw.toggle} />}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={submitting}
              placeholder={`At least ${MIN_LENGTH} characters`}
            />
          )}
        </Field>

        {password.length > 0 && (
          <div className="-mt-1 flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3].map(step => (
                <span
                  key={step}
                  className={cx(
                    "h-1.5 flex-1 rounded-pill transition-colors",
                    strength.score >= step ? strength.tone : "bg-line"
                  )}
                />
              ))}
            </div>
            <span className="w-14 text-right text-meta font-medium text-fg-subtle">{strength.label}</span>
          </div>
        )}

        <Field label="Confirm password" error={mismatch ? "Passwords don't match." : undefined}>
          {p => (
            <Input
              {...p}
              type={pw.type}
              autoComplete="new-password"
              prefix={<Lock />}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              disabled={submitting}
              placeholder="Re-enter your new password"
            />
          )}
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

        <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-1">
          {submitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
