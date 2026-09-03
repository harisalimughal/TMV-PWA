import React from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { AppShell } from "../app/AppShell";
import { IconButton } from "../ui";
import { ThemeToggle } from "../components/driver";
import { InstallAppCard } from "./pwa-settings/components/InstallAppCard";
import { NotificationsCard } from "./pwa-settings/components/NotificationsCard";

interface AccountSettingsScreenProps {
  driver: DriverProfile;
  onLogout: () => void;
  /** Present only when reached as a drill-in; the Profile tab omits it. */
  onBack?: () => void;
}

/**
 * Profile & account — a structured list. Name and email are read-only because the
 * production API exposes no driver-facing profile-update endpoint.
 */
export function AccountSettingsScreen({
  driver,
  onLogout,
  onBack
}: AccountSettingsScreenProps) {
  return (
    <AppShell
      header={
        <div className="flex items-center gap-2.5">
          {onBack && (
            <IconButton aria-label="Back to jobs" icon={<ArrowLeft />} onClick={onBack} className="-ml-1.5 text-fg" />
          )}
          <span className="text-heading text-fg">Settings</span>
        </div>
      }
    >
      <div className="px-4 pb-4 pt-6 scroll-pb-nav">
        <div className="border-t border-line pt-4">
          <p className="text-heading text-fg">{driver.fullName}</p>
          <p className="text-label font-normal text-fg-muted">Driver</p>
        </div>

        <h2 className="pb-2 pt-7 text-card text-fg">Personal details</h2>
        <InfoRow label="Name" value={driver.fullName} />
        <InfoRow label="Email" value={driver.email} />
        <p className="pt-3 text-helper text-fg-subtle">
          Your name and email come from your The Man Van account. Contact operations to change either.
        </p>

        <h2 className="pb-3 pt-7 text-card text-fg">Appearance</h2>
        <ThemeToggle />
        <p className="pt-2.5 text-helper text-fg-subtle">
          System follows your device setting.
        </p>

        <h2 className="pb-2 pt-7 text-card text-fg">App</h2>
        <div className="flex flex-col gap-4">
          <InstallAppCard />
          <NotificationsCard />
        </div>

        <h2 className="pb-2 pt-7 text-card text-fg">Account</h2>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between border-y border-line py-3.5 text-left text-body font-medium text-danger transition-colors hover:bg-danger-subtle"
        >
          Sign out
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3.5 first:border-t">
      <span className="text-label font-normal text-fg-muted">{label}</span>
      <span className="min-w-0 truncate text-body font-medium text-fg">{value}</span>
    </div>
  );
}
