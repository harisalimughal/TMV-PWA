import React from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { AppShell } from "../app/AppShell";
import { cx, IconButton } from "../ui";
import { ThemeToggle } from "../components/driver";
import { InstallAppCard } from "./pwa-settings/components/InstallAppCard";
import { NotificationsCard } from "./pwa-settings/components/NotificationsCard";

interface AccountSettingsScreenProps {
  driver: DriverProfile;
  onLogout: () => void;
  /** Present only when reached as a drill-in; the Profile tab omits it. */
  onBack?: () => void;
}

function initials(driver: DriverProfile): string {
  if (driver.initials) return driver.initials.slice(0, 2).toUpperCase();
  const parts = (driver.fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Profile & account — a structured list. Name and email are read-only because the
 * production API exposes no driver-facing profile-update endpoint.
 */
export function AccountSettingsScreen({ driver, onLogout, onBack }: AccountSettingsScreenProps) {
  return (
    <AppShell topInset={false}>
      <div className="scroll-pb-nav">
        {onBack && (
          <div className="px-5 pb-1 pt-5">
            <IconButton aria-label="Back to jobs" icon={<ArrowLeft />} onClick={onBack} className="-ml-1.5 text-fg" />
          </div>
        )}

        <div className={cx("flex items-center justify-center gap-3.5 px-5 pb-[18px]", onBack ? "pt-3" : "pt-6")}>
          <span className="grid size-[52px] shrink-0 place-items-center rounded-card bg-brand text-[17px] font-bold text-brand-fg">
            {initials(driver)}
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-fg">{driver.fullName}</h3>
            <p className="mt-0.5 text-[13.5px] text-fg-muted">Driver · The Man Van</p>
          </div>
        </div>

        <GroupLabel>Personal details</GroupLabel>
        <Field k="Name" v={driver.fullName} />
        <Field k="Email" v={<span className="select-text">{driver.email}</span>} />
        <p className="px-5 pb-1 pt-3 text-[12.5px] leading-relaxed text-fg-subtle">
          Your name and email come from your The Man Van account. Contact operations to change either.
        </p>

        <GroupLabel>Appearance</GroupLabel>
        <div className="px-5 pt-1.5">
          <ThemeToggle />
        </div>
        <p className="px-5 pb-1 pt-2.5 text-[12.5px] leading-relaxed text-fg-subtle">
          System follows your device setting.
        </p>

        <GroupLabel>App</GroupLabel>
        <div className="flex flex-col gap-2.5 px-5 pt-1.5">
          <InstallAppCard />
          <NotificationsCard />
        </div>

        <GroupLabel>Account</GroupLabel>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between border-t border-line px-5 py-4 text-left text-[14.5px] font-semibold text-danger transition-colors active:bg-danger-subtle"
        >
          Sign out
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </AppShell>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 pb-1 pt-6 text-[12px] font-bold tracking-[0.03em] text-fg-subtle">{children}</p>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3.5 border-t border-line px-5 py-[15px]">
      <span className="text-[14.5px] text-fg-muted">{k}</span>
      <span className="min-w-0 truncate text-right text-[14.5px] font-semibold text-fg">{v}</span>
    </div>
  );
}
