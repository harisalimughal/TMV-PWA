import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BrandMark } from "../../ui";

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
      <aside
        className="hidden flex-col justify-between border-r border-line bg-surface-sunken lg:flex lg:h-full lg:px-14 lg:py-16"
        style={{
          paddingLeft: "calc(1.25rem + env(safe-area-inset-left))",
          paddingRight: "calc(1.25rem + env(safe-area-inset-right))",
        }}
      >
        <div className="mx-auto w-full max-w-[420px] pt-2 lg:mx-0 lg:pt-0">
          <BrandMark size="md" tone="brand" className="mb-8" />
          <span className="block text-title text-fg">The Man Van</span>
        </div>
        <p className="mx-auto mt-6 w-full max-w-[420px] text-meta text-fg-subtle lg:mx-0 lg:mt-0">
          © The Man Van
        </p>
      </aside>

      <main
        className="flex min-h-[100dvh] justify-center bg-surface pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(2.5rem+env(safe-area-inset-top))] lg:h-full lg:min-h-0 lg:items-center lg:overflow-y-auto lg:scroll-touch lg:px-16 lg:py-12"
        style={{
          paddingLeft: "calc(1.25rem + env(safe-area-inset-left))",
          paddingRight: "calc(1.25rem + env(safe-area-inset-right))",
        }}
      >
        <div className="w-full max-w-[420px]">
          <BrandMark size="lg" markOnly className="mb-8 flex justify-center lg:hidden" />
          {children}
        </div>
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
