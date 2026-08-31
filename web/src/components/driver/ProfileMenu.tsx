import React from "react";
import { LogOut, Settings } from "lucide-react";
import { Avatar, Menu } from "../../ui";
import { useLocalAvatar } from "../../lib/profile";
import type { DriverProfile } from "../../api/auth";

export interface ProfileMenuProps {
  driver: DriverProfile;
  onOpenSettings: () => void;
  onLogout: () => void;
}

/**
 * The account affordance in the app header: an avatar button that opens a menu with
 * the driver's identity, a link to Account settings, and a set-apart Log out.
 * Keyboard nav, Esc, outside-click and focus-restore all come from <Menu>.
 */
export function ProfileMenu({ driver, onOpenSettings, onLogout }: ProfileMenuProps) {
  const localAvatar = useLocalAvatar();
  const name = driver.fullName || driver.initials;

  return (
    <Menu
      align="end"
      trigger={p => (
        <button
          ref={p.ref}
          id={p.id}
          onClick={p.onClick}
          aria-expanded={p["aria-expanded"]}
          aria-haspopup={p["aria-haspopup"]}
          aria-label="Account menu"
          className="rounded-pill transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Avatar name={name} src={localAvatar} />
        </button>
      )}
      header={
        <div className="flex items-center gap-2.5 py-0.5">
          <Avatar name={name} src={localAvatar} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-card text-fg">{driver.fullName}</p>
            <p className="truncate text-meta text-fg-subtle">{driver.email}</p>
          </div>
        </div>
      }
      items={[
        {
          id: "settings",
          label: "Account settings",
          icon: <Settings />,
          onSelect: onOpenSettings
        },
        {
          id: "logout",
          label: "Log out",
          icon: <LogOut />,
          tone: "danger",
          separatorBefore: true,
          onSelect: onLogout
        }
      ]}
    />
  );
}
