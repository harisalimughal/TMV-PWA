import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * The auth composition.
 *
 * Mobile: a calm dark-navy brand header (~upper third) with the wordmark and one
 * line of context, then the form directly on the page. Desktop: the same navy as
 * a full-height left panel, the form centred on the right. Black text on the
 * form; no floating card.
 */

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-surface text-fg lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)] lg:overflow-hidden">
      <aside className="flex flex-col justify-between border-b border-line bg-surface-sunken px-6 pb-8 pt-safe lg:h-full lg:border-b-0 lg:border-r lg:px-14 lg:py-16">
        <div className="pt-[9vh] lg:pt-0">
          <span className="block text-title text-fg">The Man Van</span>
          <p className="mt-3 max-w-sm text-body text-fg-muted lg:mt-4">
            Driver Operations — jobs, evidence, payments and customer sign-off, in one place.
          </p>
        </div>
        <p className="mt-6 text-meta text-fg-subtle lg:mt-0">© The Man Van</p>
      </aside>

      <main className="flex justify-center px-6 pb-12 pt-8 pl-safe pr-safe pb-safe lg:h-full lg:items-center lg:overflow-y-auto lg:scroll-touch lg:px-16 lg:py-12">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}

/** Kept for API compatibility — the brand now lives in <AuthLayout>. */
export function AuthBrand(_props: { subtitle?: string }) {
  return null;
}

/** Screen title + optional supporting line. */
export function AuthHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-title text-fg">{title}</h1>
      {hint && <p className="mt-1.5 text-body text-fg-muted">{hint}</p>}
    </div>
  );
}

export function usePasswordVisibility() {
  const [shown, setShown] = useState(false);
  return {
    shown,
    toggle: () => setShown(v => !v),
    type: shown ? ("text" as const) : ("password" as const)
  };
}

/** Sits in an <Input> suffix slot. tabIndex -1 so it doesn't interrupt the tab order. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      className="-mr-1 grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-surface-sunken hover:text-fg"
    >
      {shown ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
    </button>
  );
}
