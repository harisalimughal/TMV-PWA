import React, { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { forgotPassword, type ApiError } from "../api/auth";
import { Alert, Button, Field, Input } from "../ui";
import { AuthBrand, AuthHeading, AuthLayout } from "./auth/AuthKit";

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
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't send the reset link. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-control px-2 py-2 text-label font-medium text-fg-muted hover:bg-surface-sunken hover:text-fg"
      >
        <ArrowLeft className="size-[18px]" />
        Sign in
      </button>

      <AuthBrand />
      <AuthHeading
        title="Reset your password"
        hint="Enter your email and we'll send a link to set a new one."
      />

      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Check your inbox">
            If that email has a driver account, a reset link is on its way.
          </Alert>
          <Button variant="secondary" size="lg" fullWidth onClick={onBack}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Email">
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

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-1">
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
