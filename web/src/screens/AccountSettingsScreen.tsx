import React, { useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { AppShell } from "../app/AppShell";
import { Button, IconButton } from "../ui";
import { ProfilePhotoUploader } from "../components/ProfilePhotoUploader";
import { ThemeToggle } from "../components/driver";
import { useToast } from "../components/ui/Toast";
import { clearLocalAvatar, setLocalAvatar, useLocalAvatar } from "../lib/profile";

interface AccountSettingsScreenProps {
  driver: DriverProfile;
  onLogout: () => void;
  /** Present only when reached as a drill-in; the Profile tab omits it. */
  onBack?: () => void;
}

/**
 * Profile & account — a structured list. The photo is a per-device override (see
 * lib/profile.ts); name and email are read-only because the production API
 * exposes neither an avatar field nor a profile-update endpoint.
 */
export function AccountSettingsScreen({ driver, onLogout, onBack }: AccountSettingsScreenProps) {
  const committed = useLocalAvatar();
  const toast = useToast();

  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = pending !== undefined;
  const effective = dirty ? pending : committed;
  const name = driver.fullName || driver.initials;

  function handleChange(next: string | null) {
    setJustSaved(false);
    if ((next ?? null) === (committed ?? null)) setPending(undefined);
    else setPending(next);
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 350));
    if (pending) setLocalAvatar(pending);
    else clearLocalAvatar();
    setPending(undefined);
    setSaving(false);
    setJustSaved(true);
    toast.success("Profile updated");
  }

  return (
    <AppShell
      header={
        <div className="flex items-center gap-2.5">
          {onBack && (
            <IconButton aria-label="Back to jobs" icon={<ArrowLeft />} onClick={onBack} className="-ml-1.5 text-fg" />
          )}
          <span className="text-heading text-fg">Profile</span>
        </div>
      }
    >
      <div className="px-4 pb-4 pt-6 scroll-pb-nav">
        <ProfilePhotoUploader
          name={name}
          value={effective ?? null}
          dirty={dirty}
          onChange={handleChange}
          disabled={saving}
        />

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-heading text-fg">{driver.fullName}</p>
          <p className="text-label font-normal text-fg-muted">Driver</p>
        </div>

        {dirty && (
          <Button size="md" loading={saving} onClick={() => void handleSave()} className="mt-4">
            {saving ? "Saving…" : "Save photo"}
          </Button>
        )}
        {!dirty && justSaved && (
          <p className="mt-4 text-label font-medium text-success">Photo updated.</p>
        )}

        <h2 className="pb-3 pt-7 text-card text-fg">Appearance</h2>
        <ThemeToggle />
        <p className="pt-2.5 text-helper text-fg-subtle">
          System follows your device setting.
        </p>

        <h2 className="pb-2 pt-7 text-card text-fg">Personal details</h2>
        <InfoRow label="Name" value={driver.fullName} />
        <InfoRow label="Email" value={driver.email} />
        <p className="pt-3 text-helper text-fg-subtle">
          Your name and email come from your The Man Van account. Contact operations to change either.
        </p>

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
